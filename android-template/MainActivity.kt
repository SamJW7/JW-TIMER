package com.midweek.meetingtimer

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(OverlayPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
