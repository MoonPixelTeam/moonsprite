package art.moonpx.moonsprite.tablettest

import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
    private var editorWebView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // Keep the desktop-style menus above system bars and the software keyboard.
        val content = findViewById<View>(android.R.id.content)
        ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
            val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or
                WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            WindowInsetsCompat.CONSUMED
        }
        ViewCompat.requestApplyInsets(content)
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        editorWebView = webView
    }

    override fun onPause() {
        // A WebView is not guaranteed to dispatch pagehide when the Activity pauses.
        // This is best-effort; the periodic recovery checkpoint remains necessary.
        editorWebView?.evaluateJavascript(
            "window.dispatchEvent(new Event('moonsprite:background'))", null)
        super.onPause()
    }
}
