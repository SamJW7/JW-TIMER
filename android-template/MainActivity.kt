package com.midweek.meetingtimer

import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(OverlayPlugin::class.java)
        super.onCreate(savedInstanceState)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val delivered = OverlayPlugin.emitLifecycleEvent("BACK_PRESSED")
                if (!delivered) {
                    finish()
                }
            }
        })
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        OverlayPlugin.emitLifecycleEvent("APP_LEAVE")
    }

    override fun onResume() {
        super.onResume()
        OverlayPlugin.emitLifecycleEvent("APP_RETURN")
    }
}
