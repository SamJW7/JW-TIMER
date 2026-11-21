package com.midweek.meetingtimer

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
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
        val partTitle = call.getString("partTitle", "Midweek Timer") ?: "Midweek Timer"
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
