package com.wdq.smartponto

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/** Um aviso já calculado pelo app web: horário exato, texto e estilo ("alarm" ou "notify"). */
data class Alarm(val id: String, val at: Long, val title: String, val body: String, val style: String) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("at", at).put("title", title).put("body", body).put("style", style)
    val notificationId: Int get() = id.hashCode()

    companion object {
        fun fromJson(o: JSONObject) = Alarm(
            o.optString("id"), o.optLong("at"), o.optString("title", "Lembrete"),
            o.optString("body"), o.optString("style", "notify"),
        )
    }
}

/**
 * Guarda a lista de avisos e mantém sempre um único alarme do sistema apontando para o próximo.
 * O app web reenvia a lista a cada mudança; adiamentos ficam numa lista separada para não se perderem.
 */
object AlarmScheduler {
    private const val PREFS = "alarms"
    private const val KEY_LIST = "list"
    private const val KEY_SNOOZE = "snoozes"
    private const val KEY_LAST = "lastFired"
    const val ACTION_FIRE = "com.wdq.smartponto.FIRE"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun read(ctx: Context, key: String): MutableList<Alarm> {
        val arr = try { JSONArray(prefs(ctx).getString(key, "[]")) } catch (_: Exception) { JSONArray() }
        return MutableList(arr.length()) { Alarm.fromJson(arr.getJSONObject(it)) }
    }

    private fun write(ctx: Context, key: String, list: List<Alarm>) {
        val arr = JSONArray()
        list.forEach { arr.put(it.toJson()) }
        prefs(ctx).edit().putString(key, arr.toString()).apply()
    }

    fun setAll(ctx: Context, json: String) {
        val arr = try { JSONArray(json) } catch (_: Exception) { return }
        write(ctx, KEY_LIST, List(arr.length()) { Alarm.fromJson(arr.getJSONObject(it)) })
        scheduleNext(ctx)
    }

    fun snooze(ctx: Context, alarm: Alarm, minutes: Int) {
        val now = System.currentTimeMillis()
        val list = read(ctx, KEY_SNOOZE).filter { it.at > now }.toMutableList()
        list.add(alarm.copy(id = "${alarm.id.substringBefore(":adiado")}:adiado:$now", at = now + minutes * 60_000L))
        write(ctx, KEY_SNOOZE, list)
        scheduleNext(ctx)
    }

    fun test(ctx: Context, style: String, title: String, body: String) {
        val now = System.currentTimeMillis()
        val list = read(ctx, KEY_SNOOZE).filter { it.at > now }.toMutableList()
        list.add(Alarm("teste:$now", now + 5_000L, title, body, style))
        write(ctx, KEY_SNOOZE, list)
        scheduleNext(ctx)
    }

    private fun pending(ctx: Context): List<Alarm> {
        val last = prefs(ctx).getLong(KEY_LAST, 0L)
        return (read(ctx, KEY_LIST) + read(ctx, KEY_SNOOZE)).filter { it.at > last }.sortedBy { it.at }
    }

    private fun fireIntent(ctx: Context) = PendingIntent.getBroadcast(
        ctx, 0, Intent(ctx, AlarmReceiver::class.java).setAction(ACTION_FIRE),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    fun canExact(ctx: Context): Boolean {
        val am = ctx.getSystemService(AlarmManager::class.java)
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    }

    fun scheduleNext(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        val pi = fireIntent(ctx)
        val next = pending(ctx).firstOrNull()
        if (next == null) {
            am.cancel(pi)
            return
        }
        val at = maxOf(next.at, System.currentTimeMillis() + 1000)
        if (canExact(ctx)) {
            if (next.style == "alarm") {
                // Alarme de verdade: horário exato, funciona em modo de economia e mostra o ícone de alarme.
                val show = PendingIntent.getActivity(
                    ctx, 1, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
                )
                am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), pi)
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    /** Chamado quando o alarme do sistema dispara: mostra os avisos vencidos e agenda o próximo. */
    fun fireDue(ctx: Context) {
        val now = System.currentTimeMillis()
        val due = pending(ctx).filter { it.at <= now + 15_000L }
        if (due.isNotEmpty()) {
            prefs(ctx).edit().putLong(KEY_LAST, due.maxOf { it.at }).apply()
            // Avisos atrasados mais de 30 min (aparelho desligado) não tocam.
            due.filter { it.at > now - 30 * 60_000L }.forEach { Notifier.show(ctx, it) }
            write(ctx, KEY_SNOOZE, read(ctx, KEY_SNOOZE).filter { it.at > now + 15_000L })
        }
        scheduleNext(ctx)
    }
}

object Notifier {
    const val CH_ALARM = "alarmes"
    const val CH_NOTIFY = "lembretes"
    const val EXTRA_ALARM = "alarm"

    fun ensureChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CH_ALARM) == null) {
            nm.createNotificationChannel(NotificationChannel(CH_ALARM, "Alarmes", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Lembretes em tela cheia com som contínuo"
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                    AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
                )
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 600, 400, 600, 400, 600)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            })
        }
        if (nm.getNotificationChannel(CH_NOTIFY) == null) {
            nm.createNotificationChannel(NotificationChannel(CH_NOTIFY, "Lembretes e alertas do ponto", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Notificações de lembretes e do ponto"
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            })
        }
    }

    private fun action(ctx: Context, alarm: Alarm, act: String, code: Int): PendingIntent = PendingIntent.getBroadcast(
        ctx, alarm.notificationId * 4 + code,
        Intent(ctx, ActionReceiver::class.java).setAction(act).putExtra(EXTRA_ALARM, alarm.toJson().toString()),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    fun show(ctx: Context, alarm: Alarm) {
        ensureChannels(ctx)
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val open = PendingIntent.getActivity(
            ctx, alarm.notificationId,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val isAlarm = alarm.style == "alarm"
        val builder = Notification.Builder(ctx, if (isAlarm) CH_ALARM else CH_NOTIFY)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF4F46E5.toInt())
            .setContentTitle(alarm.title)
            .setContentText(alarm.body)
            .setStyle(Notification.BigTextStyle().bigText(alarm.body))
            .setContentIntent(open)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setShowWhen(true)
            .setWhen(alarm.at)
            .addAction(Notification.Action.Builder(null as android.graphics.drawable.Icon?, "Concluir", action(ctx, alarm, ActionReceiver.DONE, 0)).build())
            .addAction(Notification.Action.Builder(null as android.graphics.drawable.Icon?, "Adiar 10 min", action(ctx, alarm, ActionReceiver.SNOOZE, 1)).build())
        if (isAlarm) {
            val full = PendingIntent.getActivity(
                ctx, alarm.notificationId,
                Intent(ctx, AlarmActivity::class.java)
                    .putExtra(EXTRA_ALARM, alarm.toJson().toString())
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            builder.setCategory(Notification.CATEGORY_ALARM)
                .setFullScreenIntent(full, true)
                .setOngoing(true)
                .setAutoCancel(false)
                .setTimeoutAfter(10 * 60_000L)
        } else {
            builder.setCategory(Notification.CATEGORY_REMINDER).setAutoCancel(true)
        }
        val n = builder.build()
        // Alarme repete o som até o usuário concluir ou adiar (no máximo 10 min, pelo timeout acima).
        if (isAlarm) n.flags = n.flags or Notification.FLAG_INSISTENT
        try {
            nm.notify(alarm.notificationId, n)
        } catch (_: SecurityException) {
            // Sem permissão de notificação: nada a fazer até o usuário liberar.
        }
    }

    fun cancel(ctx: Context, alarm: Alarm) {
        ctx.getSystemService(NotificationManager::class.java).cancel(alarm.notificationId)
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        AlarmScheduler.fireDue(context)
    }
}

class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val json = intent.getStringExtra(Notifier.EXTRA_ALARM) ?: return
        val alarm = Alarm.fromJson(JSONObject(json))
        Notifier.cancel(context, alarm)
        if (intent.action == SNOOZE) AlarmScheduler.snooze(context, alarm, 10)
    }

    companion object {
        const val DONE = "com.wdq.smartponto.DONE"
        const val SNOOZE = "com.wdq.smartponto.SNOOZE"
    }
}

/** Reagenda depois de reiniciar o celular, atualizar o app ou mudar o relógio. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        AlarmScheduler.scheduleNext(context)
    }
}
