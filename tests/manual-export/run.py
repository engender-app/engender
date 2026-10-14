#!/usr/bin/env python3
"""Opt-in Pixel/English DocumentsUI probe; owns an isolated package and phone lease."""
import hashlib
import base64
import tempfile
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SERIAL = os.environ['ANDROID_SERIAL']
PACKAGE = 'dev.engender.app.test.picker77'
PORT = '9377'
REMOTE_XML = '/sdcard/engender-test-77-window.xml'
NAME = 'engender-test-77-' + str(uuid.uuid4()) + '.ttbackup'
ARCHIVE = tempfile.TemporaryDirectory(prefix='engender-manual-export-77-')
ARCHIVE_ENV = dict(os.environ, MANUAL_EXPORT_ARCHIVE_DIR=ARCHIVE.name)
subprocess.run(['npx', 'vitest', 'run', '--config', 'tests/manual-export/archive.config.ts'],
               cwd=ROOT, env=dict(ARCHIVE_ENV, MANUAL_EXPORT_ARCHIVE_PHASE='pack'), check=True)
BODY = (Path(ARCHIVE.name) / 'input.ttbackup').read_bytes()


def command(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True, cwd=ROOT).stdout.strip()


def adb(*args, check=True):
    return command('adb', '-s', SERIAL, *args, check=check)


def until(read, accept, seconds=20):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        value = read()
        if accept(value):
            return value
        time.sleep(.1)
    raise AssertionError('Timed out waiting for ' + read.__name__)


def nodes():
    adb('shell', 'uiautomator', 'dump', REMOTE_XML)
    return ET.fromstring(adb('shell', 'cat', REMOTE_XML))


def tap(node):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.attrib['bounds']))
    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))


def set_live_dka(enabled):
    adb('shell', 'am', 'start', '-a', 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS',
        '--es', ':settings:fragment_args_key', 'immediately_destroy_activities')
    for parent in nodes().iter('node'):
        children = list(parent.iter('node'))
        switches = [n for n in children if n.get('class') == 'android.widget.Switch']
        if any(n.get('text') == "Don't keep activities" for n in children) and len(switches) == 1:
            switch = switches[0]
            previous = switch.get('checked') == 'true'
            if previous != enabled:
                tap(switch)
                assert adb('shell', 'settings', 'get', 'global', 'always_finish_activities') == ('1' if enabled else '0')
            return previous
    raise AssertionError("English Developer options did not expose Don't keep activities")


def instrument(method):
    result = adb('shell', 'am', 'instrument', '-w', '-r', '-e', 'class', method,
                 PACKAGE + '.test/androidx.test.runner.AndroidJUnitRunner')
    print(result, flush=True)
    assert re.search(r'OK \(\d+ tests?\)', result), result


sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'Android/Sdk')))
aapt = sorted((sdk / 'build-tools').glob('*/aapt2'))[-1]
artifacts = [('android/app/build/outputs/apk/debug/app-debug.apk', PACKAGE),
             ('android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk', PACKAGE + '.test')]
for artifact, expected in artifacts:
    identity = re.search(r"package: name='([^']+)'", command(str(aapt), 'dump', 'badging', str(ROOT / artifact)))
    assert identity and identity.group(1) == expected, 'Build the isolated APKs before running this probe'
command('phone', 'status')
command('phone', 'take', '--label', 'codex backend77 picker recreation', '--for',
        'Opt-in manual-export lifecycle and cleanup probe', '--until', '+15m', '--package', PACKAGE, '--port', PORT)
original_setting = adb('shell', 'settings', 'get', 'global', 'always_finish_activities')
original_live = original_setting == '1'
try:
    for path, _expected in artifacts:
        print(json.dumps({'apk': path, 'sha256': hashlib.sha256((ROOT / path).read_bytes()).hexdigest()}), flush=True)
        adb('install', '-r', str(ROOT / path))
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
    adb('shell', 'input', 'keyevent', 'KEYCODE_MENU')
    original_live = set_live_dka(True)
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'am', 'start', '-n', PACKAGE + '/dev.engender.app.disguise.LauncherDefault')
    pid = until(lambda: adb('shell', 'pidof', PACKAGE, check=False), bool)
    until(lambda: adb('shell', 'cat', '/proc/net/unix'), lambda s: 'webview_devtools_remote_' + pid in s)
    adb('forward', 'tcp:' + PORT, 'localabstract:webview_devtools_remote_' + pid)
    script = """
import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9377');
try {
 const page = browser.contexts()[0].pages()[0];
 await page.waitForFunction(() => window.Capacitor?.nativePromise);
 await page.evaluate(async (data) => {
  const call = (method, args) => window.Capacitor.nativePromise('FileDelivery', method, args);
  const { transferId } = await call('beginFile', { fileName: data.name, type: 'application/octet-stream' });
  await call('appendFile', { transferId, offset: 0, base64: data.base64 });
  void call('finishFile', { transferId, byteLength: data.length, sha256: data.hash });
 }, JSON.parse(process.env.PROBE_TRANSFER));
} finally { await browser.close(); }
"""
    env = dict(os.environ, PROBE_TRANSFER=json.dumps({'name': NAME, 'base64': base64.b64encode(BODY).decode(), 'length': len(BODY), 'hash': hashlib.sha256(BODY).hexdigest()}))
    subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, env=env, check=True)
    def caller_destroyed():
        activities = adb('shell', 'dumpsys', 'activity', 'activities')
        return re.search(re.escape('mActivityComponent=' + PACKAGE + '/dev.engender.app.MainActivity')
                         + r'(?:(?!mActivityComponent=).)*state=DESTROYED finishing=false', activities, re.S) is not None
    until(caller_destroyed, bool)
    assert 'manual-export-' in adb('shell', 'run-as', PACKAGE, 'ls', 'cache')
    ui = nodes()
    assert any(n.get('text') in ('Download', 'Downloads') for n in ui.iter('node')), 'Select local Downloads before running'
    save = next(n for n in ui.iter('node') if n.get('resource-id') == 'android:id/button1' and n.get('text', '').lower() == 'save')
    tap(save)
    length = until(lambda: adb('shell', 'wc', '-c', '/sdcard/Download/' + NAME, check=False), lambda s: s.startswith(str(len(BODY)) + ' '))
    digest = adb('shell', 'sha256sum', '/sdcard/Download/' + NAME).split()[0]
    assert digest == hashlib.sha256(BODY).hexdigest()
    print(json.dumps({'liveDka': 'DESTROYED', 'bytes': len(BODY), 'sha256': digest}), flush=True)
    adb('pull', '/sdcard/Download/' + NAME, str(Path(ARCHIVE.name) / 'delivered.ttbackup'))
    subprocess.run(['npx', 'vitest', 'run', '--config', 'tests/manual-export/archive.config.ts'], cwd=ROOT, env=ARCHIVE_ENV, check=True)
    set_live_dka(False)
    instrument('dev.engender.app.files.FileDeliveryRecreationTest')
    for method in ['cancellationAndFailedWritesDeleteOnlyTheirOwnDestination', 'deniedCleanupRemainsRecordedUntilAccessReturns']:
        instrument('dev.engender.app.files.FileDeliveryCleanupTest#' + method)
    partial = subprocess.Popen(['adb', '-s', SERIAL, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
        'dev.engender.app.files.FileDeliveryCleanupTest#prepareInterruptedWriteForHost',
        PACKAGE + '.test/androidx.test.runner.AndroidJUnitRunner'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        marker = until(lambda: adb('shell', 'run-as', PACKAGE + '.test', 'cat', 'files/backup-partial-state.json', check=False),
                       lambda s: s.startswith('{'), seconds=30)
        state = json.loads(marker)
        assert 0 < state['writtenBytes'] < 1024 * 1024 + 37
        adb('shell', 'am', 'force-stop', PACKAGE)
        partial.communicate(timeout=15)
        print(json.dumps({'killedDuringWrite': state}), flush=True)
    finally:
        if partial.poll() is None:
            adb('shell', 'am', 'force-stop', PACKAGE)
            partial.communicate(timeout=15)
    instrument('dev.engender.app.files.FileDeliveryCleanupTest#restartRemovesInterruptedTargetAndKeepsUnrelatedFile')
finally:
    set_live_dka(original_live)
    if original_setting == 'null':
        adb('shell', 'settings', 'delete', 'global', 'always_finish_activities')
    else:
        adb('shell', 'settings', 'put', 'global', 'always_finish_activities', original_setting)
    adb('shell', 'rm', '-f', '/sdcard/Download/' + NAME, REMOTE_XML)
    adb('forward', '--remove', 'tcp:' + PORT, check=False)
    adb('uninstall', PACKAGE + '.test', check=False)
    adb('uninstall', PACKAGE, check=False)
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
    adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP')
    ARCHIVE.cleanup()
    command('phone', 'release', '--note', 'Manual-export probe finished; original DKA restored, own UUID/XML/forward/packages removed, Home/asleep.')
