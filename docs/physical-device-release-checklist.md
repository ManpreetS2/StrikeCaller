# Physical device release checklist

Manual checks for StrikeCaller v1.4.0. Do **not** mark these passed from CI or emulator evidence alone.

Use: **PASS** / **FAIL** / **NOTES**

Production URL: https://manpreets2.github.io/StrikeCaller/

---

## iPhone Safari

| Check | Result | Notes |
|---|---|---|
| Online launch |  |  |
| Add to Home Screen |  |  |
| Standalone launch |  |  |
| Navigation (Home / Train / Progress / More) |  |  |
| Start workout |  |  |
| Spoken audio |  | Not guaranteed offline |
| Captions |  | Must remain truthful if speech fails |
| Round bells / tones |  |  |
| Bluetooth headphones |  |  |
| Screen lock / wake lock |  |  |
| Background / foreground |  |  |
| Offline relaunch after first successful online load |  | Speech may be unavailable |
| Session completion |  | One history record, one Summary |
| Summary |  | Survives refresh |
| Stats / history persistence |  |  |
| Service-worker update after a new deployment |  | Must not reload an active workout |

---

## Android Chrome

| Check | Result | Notes |
|---|---|---|
| Online launch |  |  |
| Add to Home Screen / install |  |  |
| Standalone launch |  |  |
| Navigation (Home / Train / Progress / More) |  |  |
| Start workout |  |  |
| Spoken audio |  | Not guaranteed offline |
| Captions |  | Must remain truthful if speech fails |
| Round bells / tones |  |  |
| Bluetooth headphones |  |  |
| Screen lock / wake lock |  |  |
| Background / foreground |  |  |
| Offline relaunch after first successful online load |  | Speech may be unavailable |
| Session completion |  | One history record, one Summary |
| Summary |  | Survives refresh |
| Stats / history persistence |  |  |
| Service-worker update after a new deployment |  | Must not reload an active workout |

---

## Sign-off

Tester:

Device / OS:

Date:

Build SHA:
