# Capacitor's consumer rules keep Plugin subclasses, bridge methods and callbacks,
# including the app's native plugins and @capacitor/app. Do not keep the entire
# app package: helpers should still be optimized and obfuscated.
# AndroidPluginRegistry and Capacitor inspect plugin annotations at runtime.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault

# SQLCipher supplies its JNI rules; WorkManager supplies worker names and
# constructors. Android components are kept by the generated manifest rules.
