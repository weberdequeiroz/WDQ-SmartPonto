package com.wdq.smartponto

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.PowerManager
import android.provider.Settings
import android.app.NotificationManager
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.view.HapticFeedbackConstants
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * Abre o app web (assets copiados de smartponto/web) num WebView e oferece a ele, pela ponte
 * "SmartPontoAndroid", o que o navegador não faz sozinho: compartilhar e salvar arquivos, imprimir em PDF.
 * Os dados ficam no IndexedDB do WebView, incluído no backup automático do Android.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var geoCallback: GeolocationPermissions.Callback? = null
    private var geoOrigin: String? = null

    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(uri?.let { arrayOf(it) })
        fileCallback = null
    }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { notifyJs() }

    private val locationPermission =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            geoCallback?.invoke(geoOrigin, result.values.any { it }, false)
            geoCallback = null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#1E1B4B")) }
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // Android 15 desenha atrás das barras do sistema; o conteúdo fica entre elas.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setGeolocationEnabled(true)
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == APP_HOST) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                } catch (_: ActivityNotFoundException) {
                }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                pickFile.launch("*/*")
                return true
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.ACCESS_COARSE_LOCATION,
                ) == PackageManager.PERMISSION_GRANTED
                if (granted) {
                    callback.invoke(origin, true, false)
                } else {
                    geoOrigin = origin
                    geoCallback = callback
                    locationPermission.launch(
                        arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION),
                    )
                }
            }
        }
        web.addJavascriptInterface(Bridge(), "SmartPontoAndroid")

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl("https://$APP_HOST/assets/index.html")

        // Voltar: o app web fecha painéis e volta para a tela de ponto antes de sair.
        onBackPressedDispatcher.addCallback(this) {
            web.evaluateJavascript("window.spBack ? window.spBack() : false") { handled ->
                if (handled != "true") {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Volta de uma tela de permissões: o app web atualiza os avisos e o estado das permissões.
        if (::web.isInitialized) notifyJs()
        AlarmScheduler.scheduleNext(this)
    }

    private fun notifyJs() {
        web.evaluateJavascript("window.spResume && window.spResume()", null)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    private fun safeName(name: String) = name.replace(Regex("[^A-Za-z0-9._-]"), "_")

    inner class Bridge {
        /** Lista de avisos calculada pelo app web (JSON). */
        @JavascriptInterface
        fun setAlarms(json: String) {
            AlarmScheduler.setAll(this@MainActivity, json)
        }

        @JavascriptInterface
        fun alarmStatus(): String {
            val nm = getSystemService(NotificationManager::class.java)
            val fullScreen = Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent()
            val battery = getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
            return org.json.JSONObject()
                .put("notifications", nm.areNotificationsEnabled())
                .put("exact", AlarmScheduler.canExact(this@MainActivity))
                .put("fullScreen", fullScreen)
                .put("battery", battery)
                .toString()
        }

        @JavascriptInterface
        fun requestNotifications() {
            runOnUiThread {
                if (Build.VERSION.SDK_INT >= 33 &&
                    ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                ) {
                    notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    openSettings("notifications")
                }
            }
        }

        @SuppressLint("BatteryLife")
        @JavascriptInterface
        fun openSettings(kind: String) {
            val pkg = Uri.parse("package:$packageName")
            val intent = when (kind) {
                "exact" -> if (Build.VERSION.SDK_INT >= 31) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg) else null
                "fullscreen" -> if (Build.VERSION.SDK_INT >= 34) Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg) else null
                "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)
                else -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            } ?: return
            runOnUiThread {
                try {
                    startActivity(intent)
                } catch (_: ActivityNotFoundException) {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg))
                }
            }
        }

        @JavascriptInterface
        fun testAlarm(style: String, title: String, body: String) {
            AlarmScheduler.test(this@MainActivity, style, title, body)
        }

        /** Abre um .ics na agenda do celular. */
        @JavascriptInterface
        fun openCalendar(name: String, content: String) {
            val dir = File(cacheDir, "share").apply { mkdirs() }
            val file = File(dir, safeName(name)).apply { writeText(content) }
            val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
            val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "text/calendar")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            runOnUiThread {
                try {
                    startActivity(view)
                } catch (_: ActivityNotFoundException) {
                    shareFile(name, "text/calendar", content)
                }
            }
        }

        /** Grava o arquivo no cache e abre o menu de compartilhamento (Drive, WhatsApp, e-mail…). */
        @JavascriptInterface
        fun shareFile(name: String, mime: String, content: String) {
            val dir = File(cacheDir, "share").apply { mkdirs() }
            val file = File(dir, safeName(name)).apply { writeText(content) }
            val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
            val send = Intent(Intent.ACTION_SEND)
                .setType(mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_SUBJECT, name)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            runOnUiThread { startActivity(Intent.createChooser(send, name)) }
        }

        /** Salva em Downloads/SmartPonto e devolve onde o arquivo ficou. */
        @JavascriptInterface
        fun saveFile(name: String, mime: String, content: String): String {
            val fileName = safeName(name)
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                        put(MediaStore.Downloads.MIME_TYPE, mime)
                        put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/SmartPonto")
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: error("sem acesso a Downloads")
                    contentResolver.openOutputStream(uri)!!.use { it.write(content.toByteArray()) }
                    "Downloads/SmartPonto"
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)!!
                    File(dir, fileName).writeText(content)
                    dir.absolutePath
                }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this@MainActivity, "Não foi possível salvar: ${e.message}", Toast.LENGTH_LONG).show() }
                "erro"
            }
        }

        @JavascriptInterface
        fun shareText(text: String) {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
            runOnUiThread { startActivity(Intent.createChooser(send, "Compartilhar resumo")) }
        }

        /** Impressão do sistema; nela o usuário escolhe "Salvar como PDF". */
        @JavascriptInterface
        fun print(title: String) {
            runOnUiThread {
                val manager = getSystemService(PrintManager::class.java)
                val attrs = PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build()
                manager.print(title, web.createPrintDocumentAdapter(title), attrs)
            }
        }

        @JavascriptInterface
        fun vibrate(ms: Int) {
            runOnUiThread {
                val effect = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM
                else HapticFeedbackConstants.VIRTUAL_KEY
                web.performHapticFeedback(effect)
            }
        }
    }

    companion object {
        private const val APP_HOST = "appassets.androidplatform.net"
    }
}
