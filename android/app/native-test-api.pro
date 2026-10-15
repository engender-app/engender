# Native instrumentation calls these exact APIs from a separate APK.
# Keep their binary signatures and subclass seams in every release channel.
# Names may change: AGP applies the release mapping to the test APK.
# Do not add package wildcards or allowoptimization: it can change signatures.

-keep,allowobfuscation,includedescriptorclasses class androidx.activity.result.ActivityResult {
    <init>(int,android.content.Intent);
}

-keep,allowobfuscation,includedescriptorclasses class androidx.biometric.BiometricManager {
    androidx.biometric.BiometricManager from(android.content.Context);
    int canAuthenticate(int);
}

-keep,allowobfuscation,includedescriptorclasses class androidx.documentfile.provider.DocumentFile {
    androidx.documentfile.provider.DocumentFile fromTreeUri(android.content.Context,android.net.Uri);
    long length();
}

-keep,allowobfuscation,includedescriptorclasses class androidx.fragment.app.FragmentActivity {
    androidx.fragment.app.FragmentManager getSupportFragmentManager();
}

-keep,allowobfuscation,includedescriptorclasses class androidx.work.WorkInfo {
    int getRunAttemptCount();
    androidx.work.WorkInfo$State getState();
}

-keep,allowobfuscation,includedescriptorclasses class androidx.work.WorkInfo$State {
    boolean isFinished();
}

-keep,allowobfuscation,includedescriptorclasses class androidx.work.WorkManager {
    androidx.work.Operation cancelUniqueWork(java.lang.String);
    androidx.work.WorkManager getInstance(android.content.Context);
    com.google.common.util.concurrent.ListenableFuture getWorkInfosForUniqueWork(java.lang.String);
}

-keep,allowobfuscation,includedescriptorclasses class com.getcapacitor.Bridge {
    com.getcapacitor.PluginHandle getPlugin(java.lang.String);
    java.lang.String getServerBasePath();
    void setServerAssetPath(java.lang.String);
    void setServerBasePath(java.lang.String);
    android.webkit.WebView getWebView();
}

-keep,allowobfuscation,includedescriptorclasses class com.getcapacitor.BridgeActivity {
    com.getcapacitor.Bridge getBridge();
}

-keep,allowobfuscation,includedescriptorclasses class com.getcapacitor.CapacitorWebView {
    <init>(android.content.Context,android.util.AttributeSet);
}

-keep,allowobfuscation,includedescriptorclasses class com.getcapacitor.JSObject {
    java.lang.Boolean getBool(java.lang.String);
    com.getcapacitor.JSObject put(java.lang.String,int);
    com.getcapacitor.JSObject put(java.lang.String,java.lang.Object);
    com.getcapacitor.JSObject put(java.lang.String,java.lang.String);
    com.getcapacitor.JSObject put(java.lang.String,boolean);
}

-keep,allowobfuscation,includedescriptorclasses class com.getcapacitor.PluginCall {
    com.getcapacitor.JSObject getData();
    void reject(java.lang.String,java.lang.String,java.lang.Exception,com.getcapacitor.JSObject);
    void resolve();
    void resolve(com.getcapacitor.JSObject);
}

-keep,allowobfuscation,includedescriptorclasses class com.getcapacitor.PluginHandle {
    com.getcapacitor.Plugin getInstance();
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.AndroidPluginRegistry {
    java.util.List requiredPluginIds();
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.R$drawable {
    int ic_launcher_disguised_foreground;
    int ic_stat_mark;
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.R$id {
    int widget_doubt_button;
    int widget_doubt_header;
    int widget_header;
    int widget_mood_1;
    int widget_mood_2;
    int widget_mood_3;
    int widget_mood_4;
    int widget_mood_5;
    int widget_tally_correct;
    int widget_tally_header;
    int widget_tally_misgendered;
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.backup.BackupWork {
    void await(androidx.work.Operation);
    void schedule(android.content.Context);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.backup.PersistentBackup {
    void clear(android.content.Context);
    boolean deliver(android.content.Context);
    java.io.File directory(android.content.Context);
    void stage(android.content.Context,dev.engender.app.backup.StagedBackup,long,java.lang.String,long,long);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.backup.StagedBackup {
    <init>(java.io.File);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.clipboard.SensitiveClipboard {
    void clearIfDue(android.content.Context);
    void copy(android.content.Context,java.lang.String,long);
    void forget(android.content.Context);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.disguise.DisguiseAlias {
    java.lang.String aliasFor(android.content.Context,boolean,java.lang.String,java.lang.String);
    java.util.List aliases(android.content.Context);
    boolean apply(android.content.Context,boolean,java.lang.String,java.lang.String);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.keystore.BiometricOutcomes {
    java.lang.String forAvailability(int);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.keystore.CredentialWrapStore {
    <init>(android.content.Context,dev.engender.app.keystore.JournalKeystore$DirectorySync);
    void adopt(java.lang.String);
    void remove();
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.keystore.JournalKeystore {
    <init>(android.content.Context);
    <init>(android.content.Context,dev.engender.app.keystore.JournalKeystore$DirectorySync);
    java.lang.String ALIAS;
    java.lang.String UNLOCKED_ALIAS;
    dev.engender.app.keystore.JournalKeystore$Variant activeVariant();
    int authorizationWindowSeconds();
    boolean authorizesTheCipherItself();
    byte[] create();
    byte[] create(dev.engender.app.keystore.JournalKeystore$Variant);
    boolean deviceIsSecure();
    void erase();
    void erase(dev.engender.app.keystore.JournalKeystore$Variant);
    boolean hasKey();
    boolean hasVariant(dev.engender.app.keystore.JournalKeystore$Variant);
    javax.crypto.Cipher unwrapCipher();
    byte[] unwrapUnlocked();
    void wrap(dev.engender.app.keystore.JournalKeystore$Variant,byte[]);
    java.io.File wrappedKeyFile();
    java.io.File wrappedKeyFile(dev.engender.app.keystore.JournalKeystore$Variant);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.keystore.JournalKeystore$Variant {
    dev.engender.app.keystore.JournalKeystore$Variant GATED;
    dev.engender.app.keystore.JournalKeystore$Variant UNLOCKED;
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.keystore.PinBindingKeystore {
    java.lang.String create(java.lang.String);
    void erase();
    java.lang.String read(java.lang.String);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.launch.AppLaunch {
    java.lang.String authenticatedRoute(android.content.Context,android.content.Intent);
    android.content.Intent routeIntent(android.content.Context,java.lang.String,java.lang.String);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.lock.PinAttemptWait {
    boolean hasState();
    void hold(long,long,long,int);
    void recover(java.lang.String,long,int);
    int wrongAttempts();
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.photos.CameraCapture {
    void cancel(android.content.Context);
    byte[] consume(android.content.Context);
    android.content.Intent prepare(android.content.Context);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.photos.PhotoPickChannel {
    java.io.InputStream limit(java.io.InputStream,long);
    byte[] readFully(java.io.InputStream);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.photos.PickedFiles {
    java.util.List hold(java.util.List);
    dev.engender.app.photos.PickedFiles$Source ofBytes(byte[]);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.reminders.QuietHours {
    java.time.ZonedDateTime hold(java.time.ZonedDateTime,org.json.JSONObject);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.reminders.ReminderPayloadStore {
    void deleteKey();
    void write(android.content.Context,org.json.JSONObject);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.reminders.ReminderPlanner {
    java.time.ZonedDateTime nextCheckIn(org.json.JSONObject,java.time.ZonedDateTime);
    java.time.ZonedDateTime nextReminder(org.json.JSONObject,java.time.ZonedDateTime,org.json.JSONObject);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.reminders.ReminderScheduler {
    java.lang.String consumeLaunchRoute(android.content.Context);
    void deliverReminder(android.content.Context,org.json.JSONObject,org.json.JSONObject,java.time.ZonedDateTime);
    void rescheduleFromStore(android.content.Context);
    void rescheduleFromStore(dev.engender.app.reminders.ReminderScheduler$PayloadReader,java.time.ZonedDateTime,dev.engender.app.reminders.ReminderScheduler$PayloadWriter,java.util.function.Consumer,java.util.function.Consumer);
    void saveAndSchedule(org.json.JSONObject,java.time.ZonedDateTime,dev.engender.app.reminders.ReminderScheduler$PayloadReader,dev.engender.app.reminders.ReminderScheduler$PayloadWriter,java.util.function.Consumer,java.util.function.Consumer);
    void storeLaunchRoute(android.content.Context,java.lang.String);
    void wipe(android.content.Context);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.reset.DeviceStores {
    void wipe(android.content.Context);
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.sqlite.SqliteConnection {
    <init>();
    void open(android.content.Context,java.lang.String,java.lang.String);
    org.json.JSONArray query(java.lang.String,org.json.JSONArray);
    void exec(java.lang.String);
    void close();
    void deleteDatabaseFiles(android.content.Context,java.lang.String);
    void copyDatabaseFile();
    int getUserVersion();
    void loadNativeLibrary();
}

-keep,allowobfuscation,includedescriptorclasses class dev.engender.app.sqlite.SqlStatements {
    java.util.List split(java.lang.String);
}

-keep,allowobfuscation,includedescriptorclasses class net.zetetic.database.sqlcipher.SQLiteDatabase {
    net.zetetic.database.sqlcipher.SQLiteDatabase openOrCreateDatabase(java.io.File,java.lang.String,net.zetetic.database.sqlcipher.SQLiteDatabase$CursorFactory,net.zetetic.database.DatabaseErrorHandler,net.zetetic.database.sqlcipher.SQLiteDatabaseHook);
    android.database.Cursor rawQuery(java.lang.String,java.lang.String[]);
    void execSQL(java.lang.String);
}

-keep,allowobfuscation,includedescriptorclasses class net.zetetic.database.sqlcipher.SQLiteClosable {
    void close();
}
