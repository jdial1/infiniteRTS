# kotlinx.serialization: keep generated serializers for the game's models
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class io.github.jdial1.infiniterts.model.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class io.github.jdial1.infiniterts.model.**$$serializer { *; }

# socket.io / engine.io (OkHttp-based)
-keep class io.socket.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
