package com.midweek.meetingtimer

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(OverlayPlugin::class.java)
        super.onCreate(savedInstanceState)
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
