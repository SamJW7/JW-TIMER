package com.midweek.meetingtimer

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.Settings
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.lang.ref.WeakReference

@CapacitorPlugin(name = "Overlay")
class OverlayPlugin : Plugin() {

    companion object {
        private var instanceRef: WeakReference<OverlayPlugin>? = null

        fun emitAction(action: String) {
            val plugin = instanceRef?.get() ?: return
            val payload = JSObject().apply {
                put("action", action)
            }
            plugin.notifyListeners("overlayAction", payload)
        }

        fun emitLifecycleEvent(event: String): Boolean {
            val plugin = instanceRef?.get() ?: return false
            val payload = JSObject().apply {
                put("event", event)
                put("hasPermission", Settings.canDrawOverlays(plugin.context))
            }
            plugin.notifyListeners("appLifecycle", payload)
            return true
        }
    }

    override fun load() {
        super.load()
        instanceRef = WeakReference(this)
    }

    override fun handleOnDestroy() {
        if (instanceRef?.get() === this) {
            instanceRef = null
        }
        super.handleOnDestroy()
    }

    @PluginMethod
    fun exitApp(call: PluginCall) {
        val act = activity
        if (act != null) {
            act.runOnUiThread {
                act.finish()
            }
            call.resolve()
        } else {
            call.reject("ACTIVITY_UNAVAILABLE")
        }
    }

    @PluginMethod
    fun recognizeImage(call: PluginCall) {
        val rawBase64 = call.getString("base64")
        if (rawBase64.isNullOrBlank()) {
            call.reject("MISSING_BASE64")
            return
        }

        Thread {
            var decodedBitmap: Bitmap? = null
            try {
                val cleanBase64 = rawBase64.substringAfter("base64,", rawBase64).trim()
                val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bmp == null) {
                    call.reject("INVALID_IMAGE_BITMAP")
                    return@Thread
                }
                decodedBitmap = bmp

                val inputImage = InputImage.fromBitmap(bmp, 0)
                val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

                recognizer.process(inputImage)
                    .addOnSuccessListener { visionText ->
                        try {
                            val blocksArray = JSArray()
                            for (block in visionText.textBlocks) {
                                val linesArray = JSArray()
                                for (line in block.lines) {
                                    val wordsArray = JSArray()
                                    val elements = line.elements
                                    if (elements.isNotEmpty()) {
                                        for (el in elements) {
                                            val elBox = el.boundingBox ?: line.boundingBox ?: continue
                                            val bboxObj = JSObject().apply {
                                                put("x0", elBox.left)
                                                put("y0", elBox.top)
                                                put("x1", elBox.right)
                                                put("y1", elBox.bottom)
                                            }
                                            val wordObj = JSObject().apply {
                                                put("text", el.text)
                                                put("bbox", bboxObj)
                                            }
                                            wordsArray.put(wordObj)
                                        }
                                    } else {
                                        val lineBox = line.boundingBox
                                        if (lineBox != null && line.text.isNotBlank()) {
                                            val bboxObj = JSObject().apply {
                                                put("x0", lineBox.left)
                                                put("y0", lineBox.top)
                                                put("x1", lineBox.right)
                                                put("y1", lineBox.bottom)
                                            }
                                            val wordObj = JSObject().apply {
                                                put("text", line.text)
                                                put("bbox", bboxObj)
                                            }
                                            wordsArray.put(wordObj)
                                        }
                                    }

                                    val lineObj = JSObject().apply {
                                        put("text", line.text)
                                        put("words", wordsArray)
                                        line.boundingBox?.let { lb ->
                                            put("bbox", JSObject().apply {
                                                put("x0", lb.left)
                                                put("y0", lb.top)
                                                put("x1", lb.right)
                                                put("y1", lb.bottom)
                                            })
                                        }
                                    }
                                    linesArray.put(lineObj)
                                }

                                val paraObj = JSObject().apply {
                                    put("lines", linesArray)
                                }
                                val paragraphsArray = JSArray().apply {
                                    put(paraObj)
                                }
                                val blockObj = JSObject().apply {
                                    put("text", block.text)
                                    put("paragraphs", paragraphsArray)
                                }
                                blocksArray.put(blockObj)
                            }

                            val ret = JSObject().apply {
                                put("text", visionText.text)
                                put("blocks", blocksArray)
                            }
                            call.resolve(ret)
                        } catch (mapErr: Exception) {
                            call.reject(mapErr.localizedMessage ?: "MLKIT_MAP_FAILED", mapErr)
                        } finally {
                            recognizer.close()
                            if (!bmp.isRecycled) {
                                bmp.recycle()
                            }
                        }
                    }
                    .addOnFailureListener { ex ->
                        recognizer.close()
                        if (!bmp.isRecycled) {
                            bmp.recycle()
                        }
                        call.reject(ex.localizedMessage ?: "MLKIT_OCR_FAILED", ex)
                    }
            } catch (ex: Exception) {
                if (decodedBitmap?.isRecycled == false) {
                    decodedBitmap.recycle()
                }
                call.reject(ex.localizedMessage ?: "OCR_DECODE_FAILED", ex)
            }
        }.start()
    }

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val granted = Settings.canDrawOverlays(context)
        val ret = JSObject().apply {
            put("granted", granted)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (Settings.canDrawOverlays(context)) {
            val ret = JSObject().apply {
                put("granted", true)
            }
            call.resolve(ret)
            return
        }
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}")
        )
        startActivityForResult(call, intent, "handleOverlayPermissionResult")
    }

    @ActivityCallback
    private fun handleOverlayPermissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val granted = Settings.canDrawOverlays(context)
        val ret = JSObject().apply {
            put("granted", granted)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun startOverlay(call: PluginCall) {
        updateServiceState(call)
    }

    @PluginMethod
    fun show(call: PluginCall) {
        updateServiceState(call)
    }

    @PluginMethod
    fun updateState(call: PluginCall) {
        updateServiceState(call)
    }

    @PluginMethod
    fun stopOverlay(call: PluginCall) {
        stopServiceInternal(call)
    }

    @PluginMethod
    fun hide(call: PluginCall) {
        stopServiceInternal(call)
    }

    private fun updateServiceState(call: PluginCall) {
        if (!Settings.canDrawOverlays(context)) {
            call.reject("OVERLAY_PERMISSION_DENIED")
            return
        }

        val remainingSeconds = call.getInt("remainingSeconds", 0) ?: 0
        val isOvertime = call.getBoolean("isOvertime", false) ?: false
        val isRunning = call.getBoolean("isRunning", false) ?: false
        val isWarning = call.getBoolean("isWarning", false) ?: false
        val partTitle = call.getString("partTitle", "JW Timer") ?: "JW Timer"
        val speaker = call.getString("speaker", "") ?: ""
        val section = call.getString("section", "treasures") ?: "treasures"

        val intent = Intent(context, OverlayService::class.java).apply {
            action = OverlayService.ACTION_UPDATE_STATE
            putExtra(OverlayService.EXTRA_REMAINING_SECONDS, remainingSeconds)
            putExtra(OverlayService.EXTRA_IS_OVERTIME, isOvertime)
            putExtra(OverlayService.EXTRA_IS_WARNING, isWarning)
            putExtra(OverlayService.EXTRA_IS_RUNNING, isRunning)
            putExtra(OverlayService.EXTRA_PART_TITLE, partTitle)
            putExtra(OverlayService.EXTRA_SPEAKER, speaker)
            putExtra(OverlayService.EXTRA_SECTION, section)
        }

        ContextCompat.startForegroundService(context, intent)

        val ret = JSObject().apply {
            put("active", true)
        }
        call.resolve(ret)
    }

    private fun stopServiceInternal(call: PluginCall) {
        val intent = Intent(context, OverlayService::class.java).apply {
            action = OverlayService.ACTION_STOP
        }
        context.stopService(intent)
        val ret = JSObject().apply {
            put("active", false)
        }
        call.resolve(ret)
    }
}
