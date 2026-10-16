# Capacitor's consumer rules keep Plugin subclasses, bridge methods and callbacks,
# including the app's native plugins and @capacitor/app. Do not keep the entire
# app package: helpers should still be optimized and obfuscated.
# AndroidPluginRegistry and Capacitor inspect plugin annotations at runtime.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
# Full-mode R8 must treat these annotation interfaces as runtime instances.
# Keeping attributes alone lets it remove PluginHandle's annotation field,
# leaving permission lookup without the plugin's runtime metadata.
-keep @interface com.getcapacitor.PluginMethod { *; }
-keep @interface com.getcapacitor.annotation.CapacitorPlugin { *; }
-keep @interface com.getcapacitor.annotation.Permission { *; }
-keep @interface com.getcapacitor.annotation.ActivityCallback { *; }
-keep @interface com.getcapacitor.annotation.PermissionCallback { *; }

# SQLCipher supplies its JNI rules; WorkManager supplies worker names and
# constructors. Android components are kept by the generated manifest rules.
