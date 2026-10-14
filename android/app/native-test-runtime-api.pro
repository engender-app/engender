# AndroidX instrumentation runs in a separate APK and calls these shared APIs.
# Preserve only the audited descriptors and external subclass overrides.
# AGP applies release name mappings to the normal test dependency graph.

-keep,allowobfuscation,includedescriptorclasses class androidx.concurrent.futures.CallbackToFutureAdapter$Completer {
    boolean set(java.lang.Object);
    boolean setException(java.lang.Throwable);
}

-keep,allowobfuscation,includedescriptorclasses class androidx.tracing.Trace {
    void beginSection(java.lang.String);
    void endSection();
    void forceEnableAppTracing();
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.Lazy {
    java.lang.Object getValue();
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.LazyKt {
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.LazyKt__LazyJVMKt {
    kotlin.Lazy lazy(kotlin.jvm.functions.Function0);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.Result {
    kotlin.Result$Companion Companion;
    java.lang.Object constructor-impl(java.lang.Object);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.ResultKt {
    java.lang.Object createFailure(java.lang.Throwable);
    void throwOnFailure(java.lang.Object);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.collections.AbstractIterator {
    <init>();
    void computeNext();
    void done();
    void setNext(java.lang.Object);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.collections.CollectionsKt___CollectionsKt {
    java.lang.String joinToString$default(java.lang.Iterable,java.lang.CharSequence,java.lang.CharSequence,java.lang.CharSequence,int,java.lang.CharSequence,kotlin.jvm.functions.Function1,int,java.lang.Object);
    java.util.List toList(java.lang.Iterable);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.coroutines.intrinsics.IntrinsicsKt {
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.coroutines.intrinsics.IntrinsicsKt__IntrinsicsJvmKt {
    kotlin.coroutines.Continuation intercepted(kotlin.coroutines.Continuation);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.coroutines.intrinsics.IntrinsicsKt__IntrinsicsKt {
    java.lang.Object getCOROUTINE_SUSPENDED();
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.coroutines.jvm.internal.BaseContinuationImpl {
    kotlin.coroutines.Continuation create(java.lang.Object,kotlin.coroutines.Continuation);
    java.lang.Object invokeSuspend(java.lang.Object);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.coroutines.jvm.internal.DebugProbesKt {
    void probeCoroutineSuspended(kotlin.coroutines.Continuation);
}
# R8 records this intrinsic as a synthesized forwarding method. Its renamed
# method is not applied to the separate test APK, so preserve this one name.
-keepclassmembers class kotlin.coroutines.jvm.internal.DebugProbesKt {
    void probeCoroutineSuspended(kotlin.coroutines.Continuation);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.io.CloseableKt {
    void closeFinally(java.io.Closeable,java.lang.Throwable);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.jvm.internal.Intrinsics {
    void checkNotNullExpressionValue(java.lang.Object,java.lang.String);
    void checkNotNullParameter(java.lang.Object,java.lang.String);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.jvm.internal.Reflection {
    kotlin.reflect.KClass getOrCreateKotlinClass(java.lang.Class);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.jvm.internal.StringCompanionObject {
    kotlin.jvm.internal.StringCompanionObject INSTANCE;
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.reflect.KClass {
    java.lang.String getSimpleName();
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.time.Duration {
    kotlin.time.Duration$Companion Companion;
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.time.DurationKt {
    long toDuration(int,kotlin.time.DurationUnit);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.time.DurationUnit {
    kotlin.time.DurationUnit SECONDS;
}

-keep,allowobfuscation,includedescriptorclasses class kotlinx.coroutines.BuildersKt {
    java.lang.Object runBlocking(kotlin.coroutines.CoroutineContext,kotlin.jvm.functions.Function2);
}

-keep,allowobfuscation,includedescriptorclasses class kotlinx.coroutines.CancellableContinuation {
    void resume(java.lang.Object,kotlin.jvm.functions.Function1);
}

-keep,allowobfuscation,includedescriptorclasses class kotlinx.coroutines.CancellableContinuationImpl {
    <init>(kotlin.coroutines.Continuation,int);
}

-keep,allowobfuscation,includedescriptorclasses class kotlinx.coroutines.Dispatchers {
    kotlinx.coroutines.MainCoroutineDispatcher getMain();
}

-keep,allowobfuscation,includedescriptorclasses class kotlinx.coroutines.ExecutorsKt {
    kotlinx.coroutines.CoroutineDispatcher from(java.util.concurrent.Executor);
}

-keep,allowobfuscation,includedescriptorclasses class kotlinx.coroutines.TimeoutKt {
    java.lang.Object withTimeout-KLykuaI(long,kotlin.jvm.functions.Function2,kotlin.coroutines.Continuation);
}

-keep,allowobfuscation,includedescriptorclasses class kotlin.coroutines.jvm.internal.SuspendLambda {
    <init>(int,kotlin.coroutines.Continuation);
}
