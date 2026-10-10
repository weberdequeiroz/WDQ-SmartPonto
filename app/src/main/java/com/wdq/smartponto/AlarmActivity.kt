package com.wdq.smartponto

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.Animation
import android.view.animation.RotateAnimation
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Alarme em tela cheia: aparece sobre a tela bloqueada, com Concluir e Adiar. */
class AlarmActivity : Activity() {

    private lateinit var alarm: Alarm
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val json = intent.getStringExtra(Notifier.EXTRA_ALARM)
        if (json == null) { finish(); return }
        alarm = Alarm.fromJson(JSONObject(json))

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.statusBarColor = Color.parseColor("#2A1660")
        window.navigationBarColor = Color.parseColor("#0B0A24")

        setContentView(buildLayout())
        // Fecha sozinho depois de 10 minutos, junto com o som.
        handler.postDelayed({ finish() }, 10 * 60_000L)
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun buildLayout(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(64), dp(28), dp(36))
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(Color.parseColor("#4C1D95"), Color.parseColor("#1E1B4B"), Color.parseColor("#0B0A24")),
            )
        }

        val bell = ImageView(this).apply {
            setImageResource(R.drawable.ic_alarm_big)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(28, 255, 255, 255))
                setStroke(dp(8), Color.argb(14, 255, 255, 255))
            }
            setPadding(dp(24), dp(24), dp(24), dp(24))
            startAnimation(RotateAnimation(-12f, 12f, Animation.RELATIVE_TO_SELF, 0.5f, Animation.RELATIVE_TO_SELF, 0.15f).apply {
                duration = 160
                repeatCount = Animation.INFINITE
                repeatMode = Animation.REVERSE
            })
        }
        root.addView(bell, LinearLayout.LayoutParams(dp(112), dp(112)))

        root.addView(text(SimpleDateFormat("HH:mm", Locale("pt", "BR")).format(Date()), 68f, Typeface.create("sans-serif-thin", Typeface.NORMAL)).apply {
            setPadding(0, dp(20), 0, 0)
        })
        root.addView(text(alarm.title, 28f, Typeface.DEFAULT_BOLD).apply { setPadding(0, dp(16), 0, 0) })
        if (alarm.body.isNotBlank()) {
            root.addView(text(alarm.body, 17f, Typeface.DEFAULT).apply {
                alpha = 0.82f
                setPadding(0, dp(10), 0, 0)
            })
        }

        root.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f))

        val done = Button(this).apply {
            text = "✓  Concluir"
            isAllCaps = false
            textSize = 19f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#1E1B4B"))
            background = GradientDrawable().apply { cornerRadius = dp(40).toFloat(); setColor(Color.WHITE) }
            setOnClickListener { finishAlarm() }
        }
        root.addView(done, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64)))

        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        listOf(5, 10, 30).forEachIndexed { i, min ->
            val b = Button(this).apply {
                text = "Adiar $min min"
                isAllCaps = false
                textSize = 15f
                setTextColor(Color.WHITE)
                background = GradientDrawable().apply {
                    cornerRadius = dp(30).toFloat()
                    setColor(Color.argb(22, 255, 255, 255))
                    setStroke(dp(1), Color.argb(80, 255, 255, 255))
                }
                setOnClickListener {
                    AlarmScheduler.snooze(this@AlarmActivity, alarm, min)
                    finishAlarm()
                }
            }
            row.addView(b, LinearLayout.LayoutParams(0, dp(52), 1f).apply { if (i > 0) marginStart = dp(8) })
        }
        root.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(12)
        })
        return root
    }

    private fun text(value: String, size: Float, face: Typeface) = TextView(this).apply {
        text = value
        textSize = size
        typeface = face
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
    }

    private fun finishAlarm() {
        Notifier.cancel(this, alarm)
        finish()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
