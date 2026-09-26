# Polityka prywatności

Ostatnia aktualizacja: 26 września 2026

## Czego to dotyczy

Polityka dotyczy:

- aplikacji w przeglądarce pod adresem `app.engender.dev`, gdy zostanie opublikowana,
- kanałów dystrybucji Androida (Google Play, F-Droid, bezpośrednio pobrany
  plik APK), gdy wydania się pojawią,
- wybranego przez ciebie miejsca zapisu zaszyfrowanej kopii zapasowej lub
  niezaszyfrowanego pliku udostępnionego poza urządzeniem.

## Aplikacja webowa

Przy pobraniu lub aktualizacji aplikacji serwer widzi standardowe dane żądania:

- adres IP,
- czas żądania,
- ścieżki żądanych plików i ich rozmiary,
- nagłówki User-Agent i Referer wysłane przez przeglądarkę.

Serwer nie dostaje kont użytkowników, identyfikatorów profilu, danych
analitycznych ani treści dziennika. Treść dziennika jest zapisana w pamięci
przeglądarki na twoim urządzeniu.

Lokalny dziennik otwiera się na jeden z czterech sposobów:

- hasłem do dziennika, z którego Argon2id wyprowadza klucz,
- czterocyfrowym kodem PIN, połączonym z kluczem powiązanym z profilem
  przeglądarki,
- biometrią w obsługiwanych przeglądarkach przez rozszerzenie WebAuthn PRF
  (Touch ID, Windows Hello lub blokada urządzenia),
- kluczem zapisanym w profilu przeglądarki, który otwiera dziennik bez pytania
  o hasło.

PIN, biometria i tryb z kluczem lokalnym zależą od kluczy w konkretnym
profilu przeglądarki. Po wyczyszczeniu danych witryny, zresetowaniu profilu
lub utracie urządzenia tej lokalnej kopii dziennika nie da się już odczytać.

Możesz też utworzyć 25-znakowy klucz odzyskiwania. Pozwala otworzyć dziennik
na tym urządzeniu, gdy utracisz hasło, PIN lub dostęp biometryczny. Działa
tylko tam, gdzie nadal są dane dziennika i jego profil przeglądarki. Nie
przenosi danych na nowe urządzenie ani nie odszyfrowuje eksportu. Aplikacja
pokazuje go raz i zapisuje tylko zaszyfrowaną kopię klucza dziennika.
Przechowuj klucz odzyskiwania na papierze lub w menedżerze haseł na innym
urządzeniu. Każdy, kto ma ten klucz i dane dziennika, może je odczytać.
Klucz nie przywróci usuniętych danych.

## Wydania na Androida

Kanały dystrybucji aplikacji na Androida mają własne zasady zbierania danych i obsługi
kont. Ich operatorzy widzą instalacje i aktualizacje na swoich zasadach.

Aplikacja na Androida nie prosi o uprawnienie `INTERNET`. Treść dziennika
pozostaje na urządzeniu. Podczas zwykłego używania aplikacja nie otwiera
połączeń sieciowych ani nie wysyła treści dziennika na serwer.

Aplikacja prosi o następujące uprawnienia:

- `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` i `RECEIVE_BOOT_COMPLETED`,
  aby przypomnienie lub codzienne pytanie mogło się wyświetlić o wybranej
  godzinie, zamiast w zbiorczym oknie systemu, także po restarcie urządzenia.
- `RECORD_AUDIO` i `MODIFY_AUDIO_SETTINGS`, do notatek głosowych, ćwiczeń
  głosu i dźwięku wideo.
- `CAMERA`, do notatek wideo. Zdjęcie robi aplikacja aparatu w systemie,
  bez uprawnienia `CAMERA` dla engender.

Przypomnienia i codzienne pytanie domyślnie pokazują tylko ogólny tytuł,
nawet na zablokowanym ekranie; ustawienie w sekcji Powiadomienia wyłącza to
i pokazuje prawdziwy tytuł.

Na Androidzie aplikacja oznacza skopiowany klucz odzyskiwania jako wrażliwy.
To prośba do klawiatury, by nie zapisywała go w historii schowka. Po minucie
aplikacja usuwa klucz ze schowka. Jeśli wcześniej opuścisz aplikację, zrobi
to po powrocie. Nie usuwa niczego skopiowanego później. W przeglądarce
aplikacja nie czyści schowka.

Lokalny dziennik na Androidzie otwiera się na jeden z czterech sposobów:

- kluczem chronionym przez Android Keystore i blokadę ekranu lub biometrię
  systemową,
- bez pytania o odblokowanie; dane są zaszyfrowane na urządzeniu przez
  SQLCipher z kluczem z Android Keystore,
- czterocyfrowym kodem PIN, połączonym z kluczem wiążącym w Android Keystore,
- hasłem do dziennika, z którego Argon2id wyprowadza klucz.

Tryb z blokadą urządzenia, tryb bez pytania i PIN korzystają z kluczy
Android Keystore, których nie da się skopiować z telefonu. Po utracie
urządzenia lub wyczyszczeniu danych aplikacji tej lokalnej kopii dziennika
nie da się odczytać. Klucz odzyskiwania może otworzyć dziennik na tym samym
telefonie, gdy zawiedzie zwykłe odblokowanie. Nie przywróci danych, jeśli
urządzenie lub jego pamięć przepadną.

## Kopie zapasowe, eksporty i udostępniane pliki

Wybierasz, dokąd zapisać lub udostępnić plik. Udostępnione pliki i linki
zewnętrzne obsługują inne aplikacje, które mogą korzystać z sieci.

Jeśli zapiszesz plik w chmurze lub u dostawcy dokumentów, dostawca może
widzieć jego nazwę, czas zapisu, rozmiar i dzienniki dostępu do konta.

### Zaszyfrowane kopie zapasowe

Kopia zapasowa (`.ttbackup`), eksportowana ręcznie lub automatycznie na
Androidzie, jest szyfrowana algorytmem AES-GCM przy użyciu wybranego przez
ciebie hasła. Bez tego hasła nikt nie odczyta zawartości pliku.

### Pliki bez szyfrowania

Pozostałe eksporty nie są szyfrowane, bo służą do czytania, druku lub
udostępniania:

- pliki CSV i JSON eksportowane w Ustawieniach,
- pamiątkowa książka dziennika przygotowana do druku lub zapisu do PDF,
- zestawienie dla lekarza ze schematami dawkowania, pomiarami, wynikami badań
  i notatkami,
- kolaże zdjęć i filmy poklatkowe eksportowane z galerii zdjęć,
- karty podsumowań udostępniane jako obrazy,
- pliki PDF zapisane wcześniej w dokumentach, eksportowane z powrotem do pamięci
  urządzenia,
- pojedyncze pliki kalendarza (`.ics`) z terminami wizyt, operacji lub
  kamieni milowych.

Każdy, kto dostanie taki plik lub wydruk, może odczytać zawarte w nim dane.
Przed utworzeniem niezaszyfrowanego pliku aplikacja prosi o potwierdzenie
lub wymaga wyraźnego działania.

## Utracone klucze i hasła

Autor projektu nie może odzyskać zapomnianego hasła do dziennika, kodu PIN
ani hasła do kopii zapasowej. Nie odzyska też utraconego klucza urządzenia
ani klucza odzyskiwania.

## Wsparcie i zgłoszenia bezpieczeństwa

Ani pomoc techniczna, ani zgłoszenie podatności nie wymaga pokazywania
komukolwiek treści dziennika, kopii zapasowej ani kluczy szyfrujących.

- zasady wsparcia: `SUPPORT.md`,
- zgłaszanie podatności: `SECURITY.md`.
