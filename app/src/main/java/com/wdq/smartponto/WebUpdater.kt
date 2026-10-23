package com.wdq.smartponto

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Atualiza a parte web do app sem reinstalar o APK.
 * Baixa os arquivos publicados no site (lista em files.json) para filesDir/web e passa a servi-los
 * no mesmo endereço interno, então os dados do app (IndexedDB) continuam os mesmos.
 */
object WebUpdater {
    const val SITE = "https://weberdequeiroz.github.io/WDQ-SmartPonto/"
    private val VERSION_RE = Regex("export const VERSION = '([\\d.]+)'")
    private var lastCheck = 0L

    private fun dir(ctx: Context) = File(ctx.filesDir, "web")

    private fun versionOf(text: String?) = text?.let { VERSION_RE.find(it)?.groupValues?.get(1) }

    fun bundledVersion(ctx: Context): String =
        versionOf(ctx.assets.open("js/app.js").bufferedReader().use { it.readText() }) ?: "0"

    fun installedVersion(ctx: Context): String? =
        File(dir(ctx), "js/app.js").takeIf { it.isFile }?.let { versionOf(it.readText()) }

    /** Versão que o app está usando agora. */
    fun currentVersion(ctx: Context): String = installedVersion(ctx) ?: bundledVersion(ctx)

    fun cmp(a: String, b: String): Int {
        val pa = a.split('.').map { it.toIntOrNull() ?: 0 }
        val pb = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until 3) {
            val x = pa.getOrElse(i) { 0 }
            val y = pb.getOrElse(i) { 0 }
            if (x != y) return x.compareTo(y)
        }
        return 0
    }

    /** Ao abrir: se o APK instalado já traz uma versão igual ou mais nova, descarta a baixada. */
    fun prepare(ctx: Context) {
        val inst = installedVersion(ctx)
        if (inst == null || cmp(inst, bundledVersion(ctx)) <= 0) dir(ctx).deleteRecursively()
    }

    private fun get(url: String): ByteArray {
        val c = URL(url).openConnection() as HttpURLConnection
        c.useCaches = false
        c.connectTimeout = 15000
        c.readTimeout = 30000
        c.setRequestProperty("Cache-Control", "no-cache")
        try {
            if (c.responseCode != 200) throw IllegalStateException("HTTP ${c.responseCode} em $url")
            return c.inputStream.use { it.readBytes() }
        } finally {
            c.disconnect()
        }
    }

    /**
     * Confere o site e baixa a versão nova, se houver. Devolve a versão baixada ou null.
     * Roda fora da thread principal. Só troca os arquivos se todos baixarem certo.
     */
    @Synchronized
    fun check(ctx: Context, force: Boolean = false): String? {
        val now = System.currentTimeMillis()
        if (!force && now - lastCheck < 30 * 60_000L) return null
        lastCheck = now
        return try {
            val manifest = JSONObject(String(get("${SITE}files.json?t=$now")))
            val version = manifest.getString("version")
            if (cmp(version, currentVersion(ctx)) <= 0) return null
            val files = manifest.getJSONArray("files")
            val tmp = File(ctx.filesDir, "web-new").apply { deleteRecursively(); mkdirs() }
            for (i in 0 until files.length()) {
                val name = files.getString(i)
                if (name.startsWith("/") || name.contains("..") || name.endsWith(".apk")) continue
                val out = File(tmp, name)
                out.parentFile?.mkdirs()
                out.writeBytes(get(SITE + name + "?t=$now"))
            }
            if (versionOf(File(tmp, "js/app.js").takeIf { it.isFile }?.readText()) != version) {
                tmp.deleteRecursively()
                return null
            }
            dir(ctx).deleteRecursively()
            if (!tmp.renameTo(dir(ctx))) return null
            version
        } catch (_: Exception) {
            null
        }
    }

    private fun mime(path: String): String = when (path.substringAfterLast('.', "").lowercase()) {
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "html" -> "text/html"
        "json", "webmanifest" -> "application/json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "ico" -> "image/x-icon"
        "txt" -> "text/plain"
        else -> "application/octet-stream"
    }

    /** Serve primeiro os arquivos baixados; o que não houver vem do APK. */
    fun pathHandler(ctx: Context): WebViewAssetLoader.PathHandler {
        val assets = WebViewAssetLoader.AssetsPathHandler(ctx)
        return WebViewAssetLoader.PathHandler { path ->
            val base = dir(ctx)
            val f = File(base, path)
            if (f.isFile && f.canonicalPath.startsWith(base.canonicalPath)) {
                WebResourceResponse(mime(path), "utf-8", FileInputStream(f))
            } else {
                assets.handle(path)
            }
        }
    }
}
