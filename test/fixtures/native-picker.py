"""X11 fixture driver: only a picker transient for this test's own window is touched."""
import ctypes as C
import re
import subprocess
import sys
import time

parent = int(sys.argv[1], 16)
choice = sys.argv[2]

def picker():
    tree = subprocess.check_output(['xwininfo', '-root', '-tree'], text=True)
    for match in re.finditer(r'^\s+(0x[0-9a-f]+) "', tree, re.M):
        window = int(match.group(1), 16)
        if window == parent:
            continue
        props = subprocess.check_output(['xprop', '-id', hex(window), 'WM_TRANSIENT_FOR'], text=True)
        target = re.search(r'window id # (0x[0-9a-f]+)', props)
        if target and int(target.group(1), 16) == parent:
            return window
    return None

deadline = time.monotonic() + 10
window = None
while not window and time.monotonic() < deadline:
    window = picker()
    if not window:
        time.sleep(.1)
if not window:
    print(subprocess.check_output(['xwininfo', '-root', '-tree'], text=True), file=sys.stderr)
    raise RuntimeError('No native picker owned by the fixture window')

x = C.CDLL('libX11.so.6')
xt = C.CDLL('libXtst.so.6')
x.XOpenDisplay.argtypes = [C.c_char_p]; x.XOpenDisplay.restype = C.c_void_p
x.XSetInputFocus.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_ulong]
x.XRaiseWindow.argtypes = [C.c_void_p, C.c_ulong]
x.XFlush.argtypes = [C.c_void_p]
x.XCloseDisplay.argtypes = [C.c_void_p]
x.XKeysymToKeycode.argtypes = [C.c_void_p, C.c_ulong]; x.XKeysymToKeycode.restype = C.c_ubyte
x.XkbKeycodeToKeysym.argtypes = [C.c_void_p, C.c_ubyte, C.c_int, C.c_int]; x.XkbKeycodeToKeysym.restype = C.c_ulong
xt.XTestFakeKeyEvent.argtypes = [C.c_void_p, C.c_uint, C.c_int, C.c_ulong]
xt.XTestFakeMotionEvent.argtypes = [C.c_void_p, C.c_int, C.c_int, C.c_int, C.c_ulong]
xt.XTestFakeButtonEvent.argtypes = [C.c_void_p, C.c_uint, C.c_int, C.c_ulong]
display = x.XOpenDisplay(None)
if not display:
    raise RuntimeError('Authenticated test display unavailable')

def key(symbol, pressed):
    code = x.XKeysymToKeycode(display, symbol)
    if not code:
        raise RuntimeError('Unsupported fixture keyboard symbol')
    xt.XTestFakeKeyEvent(display, code, int(pressed), 0)

def tap(symbol):
    key(symbol, True); key(symbol, False); x.XFlush(display)

try:
    x.XRaiseWindow(display, window)
    x.XSetInputFocus(display, window, 1, 0)
    x.XFlush(display)
    if choice == '--cancel':
        tap(0xff1b)  # Escape
    else:
        key(0xffe3, True); tap(ord('l')); key(0xffe3, False); x.XFlush(display)  # Ctrl+L
        time.sleep(.2)
        key(0xffe3, True); tap(ord('a')); key(0xffe3, False); x.XFlush(display)  # Replace prefilled location
        for char in choice:
            symbol = ord(char)
            code = x.XKeysymToKeycode(display, symbol)
            shifted = x.XkbKeycodeToKeysym(display, code, 0, 0) != symbol
            if shifted and x.XkbKeycodeToKeysym(display, code, 0, 1) != symbol:
                raise RuntimeError('Fixture path requires an unsupported keyboard layout')
            if shifted: key(0xffe1, True)
            tap(symbol)
            if shifted: key(0xffe1, False)
            time.sleep(.005)
        x.XFlush(display)
        time.sleep(.2)
        info = subprocess.check_output(['xwininfo', '-id', hex(window)], text=True)
        geometry = {label: int(re.search(label + r':\s+(-?\d+)', info).group(1)) for label in ['Absolute upper-left X', 'Absolute upper-left Y', 'Width', 'Height']}
        # The standard GTK picker was visually checked; click its Open button explicitly.
        xt.XTestFakeMotionEvent(display, -1, geometry['Absolute upper-left X'] + geometry['Width'] - 48,
                               geometry['Absolute upper-left Y'] + geometry['Height'] - 24, 0)
        xt.XTestFakeButtonEvent(display, 1, 1, 0); xt.XTestFakeButtonEvent(display, 1, 0, 0)
        x.XFlush(display)
    print('Native picker action sent to fixture window:', choice == '--cancel' and 'cancel' or 'select')
finally:
    x.XCloseDisplay(display)
