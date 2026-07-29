package net.thetaspace.communications

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import net.thetaspace.communications.ui.ThetaCommApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ThetaCommApp()
        }
    }

    override fun onStart() {
        super.onStart()
        (application as ThetaCommApplication).container.realtime.start()
    }

    override fun onStop() {
        (application as ThetaCommApplication).container.realtime.stop()
        super.onStop()
    }
}
