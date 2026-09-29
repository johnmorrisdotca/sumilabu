"""The MagTag's speaker.

`coin.wav` is the sound the board shipped with: the sample array from
Adafruit's shipping demo (MIT, Limor Fried 2020), which played it on the DAC
when button D was pressed. It was converted sample-for-sample, so it is the
same sound. Keep the file; nothing else has it.

How it plays: CircuitPython's `audioio.AudioOut` needs a DMA mode the
ESP32-S2 build does not have ("Failed to create continuous channels"), so the
clip goes out the way the factory sketch did it, one sample at a time on the
DAC from a loop paced by the clock. A bare loop manages about 75 kHz here,
so the clip, resampled to 11,025 Hz, holds pitch with a busy-wait between samples. Button clicks are
PWM square waves, as Adafruit's own MagTag library does them.

The amplifier is off between sounds: with it on, the speaker hisses and
draws current for nothing.
"""

import time

import analogio
import board
import digitalio
import pwmio

COIN_WAV = "/sounds/coin.wav"
WAV_HEADER = 44  # 8-bit unsigned mono, the header the converter wrote
# The clip is stored at 11,025 Hz, not the original 16 kHz: the paced loop
# below costs about 74 us a sample, so 16 kHz played 15% slow and flat.
MID = 0x80 << 8  # silence, for the amplifier to switch on and off without a thump

_enable = digitalio.DigitalInOut(board.SPEAKER_ENABLE)
_enable.direction = digitalio.Direction.OUTPUT
_enable.value = False


def _play_samples(samples, rate):
    """Unsigned 8-bit samples out of the DAC at `rate` Hz."""
    period = 1_000_000_000 // rate
    dac = analogio.AnalogOut(board.SPEAKER)
    try:
        dac.value = MID
        _enable.value = True
        due = time.monotonic_ns()
        for v in samples:
            dac.value = v << 8
            due += period
            while time.monotonic_ns() < due:
                pass
        dac.value = MID
    finally:
        _enable.value = False
        dac.deinit()


def coin():
    """The shipped sound. Silent, not an error, if the file is missing."""
    try:
        with open(COIN_WAV, "rb") as f:
            header = f.read(WAV_HEADER)
            samples = f.read()
    except OSError:
        return
    rate = int.from_bytes(header[24:28], "little")
    _play_samples(samples, rate)


def tone(frequency, seconds=0.08, duty=0.25):
    """A short square-wave click for button presses."""
    pwm = pwmio.PWMOut(board.SPEAKER, frequency=int(frequency), duty_cycle=int(65535 * duty))
    try:
        _enable.value = True
        time.sleep(seconds)
    finally:
        _enable.value = False
        pwm.deinit()
