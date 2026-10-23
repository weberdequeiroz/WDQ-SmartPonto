plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.wdq.smartponto"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.wdq.smartponto"
        minSdk = 26
        targetSdk = 35
        versionCode = 15
        versionName = "1.8.0"
    }
    signingConfigs {
        // Chave fixa: cada APK novo instala por cima do anterior sem perder dados.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }
    // O app web (smartponto/web) é empacotado como assets e aberto pelo WebView.
    sourceSets["main"].assets.srcDirs("../web")
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }
dependencies {
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
