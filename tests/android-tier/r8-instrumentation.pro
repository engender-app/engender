# AndroidX's optional coroutine screenshot adapter is outside this native tier.
# These warnings apply only to the test APK, never to the app's release shrinker.
-dontwarn androidx.concurrent.futures.SuspendToFutureAdapter

# Compile-only types referenced by the test dependencies.
-dontwarn javax.lang.model.element.Modifier
-dontwarn com.google.errorprone.annotations.MustBeClosed
