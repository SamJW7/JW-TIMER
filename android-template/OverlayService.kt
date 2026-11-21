package com.midweek.meetingtimer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import kotlin.math.abs

class OverlayService : Service() {

    companion object {
        const val ACTION_UPDATE_STATE = "com.midweek.meetingtimer.ACTION_UPDATE_STATE"
        const val ACTION_STOP = "com.midweek.meetingtimer.ACTION_STOP"

        const val EXTRA_REMAINING_SECONDS = "remainingSeconds"
        const val EXTRA_IS_OVERTIME = "isOvertime"
        const val EXTRA_IS_WARNING = "isWarning"
        const val EXTRA_IS_RUNNING = "isRunning"
        const val EXTRA_PART_TITLE = "partTitle"
        const val EXTRA_SPEAKER = "speaker"
        const val EXTRA_SECTION = "section"

        private const val NOTIFICATION_CHANNEL_ID = "midweek_timer_overlay_channel"
        private const val NOTIFICATION_ID = 4102
    }

    private lateinit var windowManager: WindowManager
    private var overlayView: LinearLayout? = null
    private var layoutParams: WindowManager.LayoutParams? = null

    private var timerTextView: TextView? = null
    private var titleTextView: TextView? = null
    private var speakerTextView: TextView? = null
    private var playPauseBtn: TextView? = null
    private var pillContainer: LinearLayout? = null

    private var remainingSeconds: Int = 0
    private var isOvertime: Boolean = false
    private var isWarning: Boolean = false
    private var isRunning: Boolean = false
    private var partTitle: String = "Midweek Timer"
    private var speaker: String = ""
    private var section: String = "treasures"

    private val mainHandler = Handler(Looper.getMainLooper())
    private val localTickRunnable = object : Runnable {
        override fun run() {
            if (isRunning) {
                remainingSeconds -= 1
                if (remainingSeconds < 0) {
                    isOvertime = true
                    isWarning = false
                } else if (remainingSeconds <= 30) {
                    isWarning = true
                }
                renderPillState()
                mainHandler.postDelayed(this, 1000L)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelfCleanly()
            return START_NOT_STICKY
        }

        val notification = buildForegroundNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        if (intent != null) {
            remainingSeconds = intent.getIntExtra(EXTRA_REMAINING_SECONDS, remainingSeconds)
            isOvertime = intent.getBooleanExtra(EXTRA_IS_OVERTIME, remainingSeconds < 0)
            isWarning = intent.getBooleanExtra(EXTRA_IS_WARNING, !isOvertime && remainingSeconds <= 30)
            isRunning = intent.getBooleanExtra(EXTRA_IS_RUNNING, false)
            partTitle = intent.getStringExtra(EXTRA_PART_TITLE) ?: partTitle
            speaker = intent.getStringExtra(EXTRA_SPEAKER) ?: ""
            section = intent.getStringExtra(EXTRA_SECTION) ?: "treasures"
        }

        ensureOverlayAttached()
        renderPillState()
        syncLocalTicker()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        mainHandler.removeCallbacks(localTickRunnable)
        detachOverlay()
        super.onDestroy()
    }

    private fun stopSelfCleanly() {
        mainHandler.removeCallbacks(localTickRunnable)
        detachOverlay()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Midweek Timer Floating Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the floating meeting timer pill active over other apps"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(this, 0, openAppIntent, pendingFlags)

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Midweek Timer Active")
            .setContentText(partTitle)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    private fun ensureOverlayAttached() {
        if (overlayView != null) return

        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dp(16)
            y = dp(90)
        }
        layoutParams = params

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(8), dp(10), dp(8))
            elevation = dp(10).toFloat()
        }
        pillContainer = root

        // Left column: countdown + part title + speaker
        val infoCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 0, dp(10), 0)
        }

        val timeView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            typeface = Typeface.MONOSPACE
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.parseColor("#10B981"))
            includeFontPadding = false
        }
        timerTextView = timeView

        val titleView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
            setTextColor(Color.parseColor("#F8FAFC"))
            setTypeface(Typeface.DEFAULT_BOLD)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            maxWidth = dp(145)
        }
        titleTextView = titleView

        val speakerView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            setTextColor(Color.parseColor("#94A3B8"))
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            maxWidth = dp(145)
        }
        speakerTextView = speakerView

        infoCol.addView(timeView)
        infoCol.addView(titleView)
        infoCol.addView(speakerView)
        root.addView(infoCol)

        // Right controls: Play/Pause, Next, Open App
        val controlsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val playBtn = createMiniButton("▶") {
            isRunning = !isRunning
            syncLocalTicker()
            renderPillState()
            OverlayPlugin.emitAction("PLAY_PAUSE")
        }
        playPauseBtn = playBtn

        val nextBtn = createMiniButton("⏭") {
            OverlayPlugin.emitAction("NEXT_PART")
        }

        val openBtn = createMiniButton("↗") {
            bringMainActivityToFront()
            OverlayPlugin.emitAction("RETURN_TO_APP")
        }

        controlsRow.addView(playBtn)
        controlsRow.addView(createSpacer(dp(5)))
        controlsRow.addView(nextBtn)
        controlsRow.addView(createSpacer(dp(5)))
        controlsRow.addView(openBtn)

        root.addView(controlsRow)

        attachDragListener(root, params)
        windowManager.addView(root, params)
        overlayView = root
    }

    private fun createMiniButton(label: String, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            text = label
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            minWidth = dp(34)
            minHeight = dp(34)
            setPadding(dp(8), dp(6), dp(8), dp(6))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#1E293B"))
                setStroke(dp(1), Color.parseColor("#334155"))
            }
            setOnClickListener { onClick() }
        }
    }

    private fun createSpacer(widthPx: Int): View {
        return View(this).apply {
            layoutParams = LinearLayout.LayoutParams(widthPx, 1)
        }
    }

    private fun attachDragListener(targetView: View, params: WindowManager.LayoutParams) {
        val touchSlop = ViewConfiguration.get(this).scaledTouchSlop
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var isDragging = false

        targetView.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - initialTouchX).toInt()
                    val dy = (event.rawY - initialTouchY).toInt()
                    if (abs(dx) > touchSlop || abs(dy) > touchSlop) {
                        isDragging = true
                    }
                    if (isDragging) {
                        params.x = initialX + dx
                        params.y = initialY + dy
                        if (overlayView != null) {
                            windowManager.updateViewLayout(overlayView, params)
                        }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> isDragging
                else -> false
            }
        }
    }

    private fun bringMainActivityToFront() {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivity(intent)
    }

    private fun syncLocalTicker() {
        mainHandler.removeCallbacks(localTickRunnable)
        if (isRunning) {
            mainHandler.postDelayed(localTickRunnable, 1000L)
        }
    }

    private fun renderPillState() {
        val isOver = isOvertime || remainingSeconds < 0
        val absSec = abs(remainingSeconds)
        val mins = absSec / 60
        val secs = absSec % 60
        val formatted = (if (isOver) "+" else "") +
            String.format("%02d:%02d", mins, secs)

        val accentColor = when {
            isOver -> Color.parseColor("#EF4444")
            isWarning || remainingSeconds <= 30 -> Color.parseColor("#F59E0B")
            else -> Color.parseColor("#10B981")
        }

        val bgColor = if (isOver) Color.parseColor("#2A0B12") else Color.parseColor("#0B1329")
        val strokeColor = if (isOver) Color.parseColor("#EF4444") else Color.parseColor("#334155")

        pillContainer?.background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(18).toFloat()
            setColor(bgColor)
            setStroke(dp(1), strokeColor)
        }

        timerTextView?.text = formatted
        timerTextView?.setTextColor(accentColor)

        titleTextView?.text = partTitle
        if (speaker.isNotBlank()) {
            speakerTextView?.visibility = View.VISIBLE
            speakerTextView?.text = speaker
        } else {
            speakerTextView?.visibility = View.GONE
        }

        playPauseBtn?.text = if (isRunning) "⏸" else "▶"
    }

    private fun detachOverlay() {
        overlayView?.let { view ->
            try {
                windowManager.removeView(view)
            } catch (_: Exception) {
            }
        }
        overlayView = null
    }
}
