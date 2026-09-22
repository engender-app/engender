# Polityka prywatności

Ostatnia aktualizacja: 17 września 2026

Tak działa enGender w wydanej wersji. Każde miejsce jest tu opisane od dnia,
w którym rusza, i ani chwili wcześniej.

## Czego to dotyczy

enGender działa w kilku miejscach naraz i każde z nich widzi co innego:

- aplikacja webowa pod adresem `app.engender.dev`, kiedy hosting ruszy,
- kanały dystrybucji wydań na Androida (Google Play, F-Droid, plik APK do
  pobrania), kiedy te wydania się pojawią,
- miejsce zapisu, do którego trafia zaszyfrowana kopia zapasowa albo plik
  udostępniony poza urządzenie.

Jedno zdanie o wszystkich trzech naraz byłoby nieprawdziwe przynajmniej w jednym
z nich, więc każde jest opisane osobno.

## Aplikacja webowa

Serwer, który wysyła aplikację do przeglądarki, widzi przy pobraniu i przy
aktualizacji to samo, co widzi każdy serwer WWW:

- adres IP,
- godzinę zapytania,
- ścieżki i rozmiary pobranych plików,
- nagłówki User-Agent i Referer wysłane przez przeglądarkę.

Serwer nie dostaje kont użytkowników, identyfikatorów profilu, telemetrii ani
treści dziennika. Dane dziennika zostają w pamięci przeglądarki, na urządzeniu.

Na samym urządzeniu lokalny dziennik otwiera się w jednym z czterech trybów:

- hasłem do dziennika, przetwarzanym przez Argon2id,
- czterocyfrowym kodem PIN, połączonym z kluczem powiązanym z profilem
  przeglądarki,
- biometrią w obsługiwanych przeglądarkach przez rozszerzenie WebAuthn PRF
  (Touch ID, Windows Hello lub blokada urządzenia),
- kluczem lokalnym zapisanym w pamięci przeglądarki, otwierającym dziennik bez
  dodatkowego pytania.

Tryb PIN, biometria i klucz lokalny zależą od danych trzymanych w tym konkretnym
profilu przeglądarki. Wyczyszczenie danych witryny, reset profilu albo utrata
urządzenia sprawia, że tej lokalnej kopii nie da się już odczytać.

Można też utworzyć opcjonalny 25-znakowy klucz odzyskiwania. Taki klucz pozwala
otworzyć dziennik na tym urządzeniu, jeśli zapomnisz hasła, kodu PIN albo
zawiedzie biometria. Działa tylko na urządzeniu i profilu, na którym dziennik
fizycznie się znajduje; nie pozwala przenieść danych na nowy sprzęt ani
odszyfrować kopii zapasowej. Klucz odzyskiwania wyświetla się tylko raz i nigdy
nie trafia poza urządzenie.

## Wydania na Androida

Wydania na Androida rozchodzą się przez sklepy i katalogi, które mają własną
telemetrię i własne konta. Operator takiego kanału widzi instalację
i aktualizację na zasadach ze swojego regulaminu, nie z tego dokumentu.

Aplikacja na Androida nie prosi o uprawnienie `INTERNET`. W samej aplikacji
dane zostają na urządzeniu. Przy zwykłym używaniu aplikacja nie otwiera połączeń
sieciowych i nie wysyła wpisów na żaden serwer.

Uprawnienia, o które prosi, pokrywają trzy cele:

- `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` i `RECEIVE_BOOT_COMPLETED` –
  dzięki nim przypomnienie albo codzienne pytanie może się pokazać, odezwać
  się o wybranej przez ciebie porze zamiast w zbiorczym oknie systemu
  i zadziałać także po restarcie urządzenia.
- `RECORD_AUDIO` i `MODIFY_AUDIO_SETTINGS` – do notatek głosowych.
- `CAMERA` – do notatek wideo. Samo zdjęcie robi za to systemowa aplikacja
  aparatu, bez żadnego uprawnienia po stronie tej aplikacji.

Przypomnienia i codzienne pytanie domyślnie pokazują tylko ogólny tytuł,
nawet na zablokowanym ekranie; ustawienie w sekcji Powiadomienia wyłącza to
i pokazuje prawdziwy tytuł.

Kopiowanie klucza odzyskiwania na Androidzie trafia na wpis schowka oznaczony
jako wrażliwy, pominięty w historii schowka klawiatury; aplikacja usuwa go po
minucie.

Lokalny dziennik na Androidzie otwiera się w jednym z czterech trybów:

- kluczem chronionym przez Android Keystore i blokadę ekranu lub biometrię
  systemową,
- w trybie bez pytania o odblokowanie, gdzie dziennik jest szyfrowany w spoczynku
  przez SQLCipher i klucz z Android Keystore,
- czterocyfrowym kodem PIN, połączonym ze sprzętowym kluczem wiążącym w Android
  Keystore,
- hasłem do dziennika, przetwarzanym przez Argon2id.

Tryby powiązane ze sprzętem (biometria, tryb bez pytania i PIN) opierają się na
kluczach w Android Keystore, których nie da się skopiować z telefonu. Utrata
urządzenia albo skasowanie danych aplikacji niszczy tę lokalną kopię. Opcjonalny
klucz odzyskiwania może otworzyć dziennik na tym samym telefonie przy utracie
danych logowania, ale nie pomoże, jeśli urządzenie przepadło.

## Kopie zapasowe, eksporty i udostępniane pliki

Przy zapisie i udostępnianiu plików miejsce docelowe wybierasz ty.

Jeśli plik trafi na dysk w chmurze albo do dostawcy dokumentów, ten dostawca
zobaczy metadane pliku: nazwę, rozmiar, datę zapisu i wpisy w logach dostępu do
konta.

### Zaszyfrowane kopie zapasowe

Zaszyfrowana kopia zapasowa (`.ttbackup`), eksportowana ręcznie albo tworzona
przez automatyczną kopię na Androidzie, jest zabezpieczona szyfrem AES-GCM
i wybranym przez ciebie hasłem do kopii. Bez tego hasła nikt nie odczyta
zawartości pliku.

### Świadomie jawne eksporty

Inne pliki opuszczają aplikację w formie jawnej, ponieważ służą do czytania,
druku albo przekazania komuś innemu:

- zwykły eksport danych do formatu CSV lub JSON z poziomu ustawień,
- pamiątkowa książka dziennika przygotowana do druku lub zapisu do PDF,
- zestawienie dla lekarza przygotowane do przekazania zespołowi medycznemu
  (dawki leków, pomiary, wyniki badań, objawy i notatki),
- kolaże zdjęć i filmy poklatkowe eksportowane z galerii zdjęć,
- pamiątkowe karty podsumowań (wrapped) udostępniane jako obrazy,
- pliki PDF zapisane wcześniej w dokumentach, eksportowane z powrotem do pamięci
  urządzenia,
- pojedyncze pliki kalendarza (`.ics`) z terminami wizyt, operacji lub dat
  związanych z tranzycją.

Każdy, kto dostanie taki plik lub wydruk, może przeczytać zawarte w nim dane.
Aplikacja prosi o potwierdzenie lub wyraźne działanie przed wygenerowaniem
niezaszyfrowanego pliku.

## Czego ten projekt nie obiecuje

- Że aplikacja webowa nie wykonuje żadnych zapytań sieciowych. Wykonuje, bo
  inaczej nie dałoby się jej pobrać ani zaktualizować.
- Że kanały dystrybucji niczego nie zbierają na własnych zasadach.
- Że autor projektu może odzyskać zapomniane hasło do dziennika, utracony kod
  PIN, skasowany klucz z urządzenia, zgubiony klucz odzyskiwania albo zapomniane
  hasło do kopii zapasowej. Żadnego z nich nie da się odzyskać z zewnątrz.
- Że niezaszyfrowany eksport pozostanie prywatny po przekazaniu go innej
  aplikacji, osobie lub usłudze w chmurze.

## Wsparcie i zgłoszenia bezpieczeństwa

Ani pomoc techniczna, ani zgłoszenie podatności nie wymaga pokazywania
komukolwiek treści dziennika, kopii zapasowej ani kluczy szyfrujących.

- zasady wsparcia: `SUPPORT.md`,
- zgłaszanie podatności: `SECURITY.md`.
