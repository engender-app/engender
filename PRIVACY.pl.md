# Polityka prywatności

Ostatnia aktualizacja: 11 listopada 2026

engender to dziennik tranzycji. Tworzy go i publikuje Alicja Barankiewicz
w Warszawie. Ta polityka dotyczy aplikacji na Androida, aplikacji
w przeglądarce, strony internetowej z przewodnikiem i wiadomości z prośbą
o pomoc.

## Kontakt

- e-mail: engender-app@pm.me
- błędy i ogólne pytania: https://github.com/engender-app/engender/issues
- problemy z bezpieczeństwem: https://github.com/engender-app/engender/blob/main/SECURITY.md

Żeby otrzymać pomoc, nigdy nie trzeba wysyłać treści dziennika, kopii
zapasowej ani kluczy.

## Twój dziennik

engender nie ma kont ani serwera z twoim dziennikiem. Dziennik zostaje na
twoim urządzeniu i nic z niego nie trafia do autorki ani do nikogo innego.
Jego baza i media są zaszyfrowane na urządzeniu.

Dwie rzeczy są poza tym szyfrowaniem. To, czego aplikacja potrzebuje przed
odblokowaniem, jest zapisane bez szyfrowania: motyw, paleta, język,
kamuflaż, czas blokady i informacje o sposobie odblokowania. Na Androidzie zrobione zdjęcie trafia najpierw
do niezaszyfrowanego pliku tymczasowego w pamięci podręcznej aplikacji,
a dopiero potem engender je importuje i szyfruje.

## Utracone klucze i hasła

Autorka nie odzyska zapomnianego hasła do dziennika, kodu PIN ani hasła do
kopii zapasowej. Nie odzyska też utraconego klucza urządzenia ani klucza
odzyskiwania.

## Aplikacja na Androida

Aplikacja na Androida nie prosi o uprawnienie `INTERNET`. Nie otwiera
połączeń sieciowych i niczego nie wysyła na żaden serwer. Wyłącza też kopię
zapasową Androida w chmurze i przenoszenie danych między telefonami.
Miejsce, z którego pobierasz aplikację (GitHub, Google Play albo F-Droid),
obsługuje pobieranie na własnych zasadach.

Na kilka rzeczy w samym Androidzie aplikacja ma tylko częściowy wpływ.
Aplikacja rezygnuje z wysyłania danych diagnostycznych WebView do Google,
ale Google Safe Browsing pozostaje w WebView domyślnie włączone i może
korzystać z dostępu do sieci usług Google Play. Aplikacja prosi klawiaturę,
żeby nie uczyła się wpisywanych słów, a klawiatura może tę prośbę
zignorować. Klawiatura i przeglądarka mogą wysyłać własne żądania sieciowe
niezależnie od engender.

Aplikacja ma następujące uprawnienia:

- `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` i `RECEIVE_BOOT_COMPLETED`,
  żeby przypomnienia przychodziły o ustawionej godzinie, także po restarcie
  telefonu.
- `RECORD_AUDIO` i `MODIFY_AUDIO_SETTINGS`, do nagrywania głosu i dźwięku
  w notatkach wideo.
- `CAMERA`, do zdjęć i notatek wideo.
- `USE_BIOMETRIC` i `USE_FINGERPRINT`, do systemowego okna odblokowania.
  Aplikacja nie widzi odcisku palca ani twarzy.
- `WAKE_LOCK`, żeby dokończyć zaplanowaną kopię zapasową przy wyłączonym
  ekranie.
- `dev.engender.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, które dodaje
  biblioteka Androida, żeby wewnętrzne komunikaty aplikacji mogła wysyłać
  tylko ona sama.

## Aplikacja w przeglądarce

Aplikacja w przeglądarce działa pod adresem `app.engender.barankiewicz.dev`,
na serwerze w OVH. Dziennik zostaje w przeglądarce i nigdy nie jest
wysyłany. Wczytanie aplikacji albo aktualizacji to zwykłe żądanie
internetowe, więc serwer widzi adres IP, czas, żądany adres oraz nagłówki
User-Agent i Referer wysłane przez przeglądarkę. Dzienniki dostępu są
wyłączone. Dzienniki błędów mogą zawierać adres IP i żądany adres, a serwer
trzyma je najwyżej siedem dni.

Czcionki i pliki do rozpoznawania tekstu pochodzą z tego samego serwera.
Wynik badań skanuje się na twoim urządzeniu.

## Strona internetowa i przewodnik

Strona, przewodnik i ta polityka pod adresem `engender.barankiewicz.dev`
korzystają z hostingu lh.pl, który prowadzi dzienniki dostępu i błędów. Mogą
one zawierać adresy IP, żądane adresy i nagłówki przeglądarki. Strona
zapamiętuje język i motyw w lokalnej pamięci przeglądarki.

## Licznik otwarć

Strona i aplikacja w przeglądarce wysyłają jedno puste żądanie przy każdym
otwarciu z połączeniem z siecią. Aplikacja na Androida nie wysyła żadnego.
Żądanie nie zawiera danych dziennika, nazwy strony, strony odsyłającej ani
ciasteczek. Serwer, który je odbiera, widzi adres IP i nagłówki
przeglądarki, jak przy każdym żądaniu, i usuwa je, zanim doda jedno otwarcie
do sumy „aplikacja” albo „strona” we własnej instancji GoatCounter.

Zostają tylko te sumy godzinowe. Są przechowywane bezterminowo i widzi je
tylko autorka. Nie ma identyfikatorów odwiedzających, sesji ani podziału
według lokalizacji czy urządzenia. Odświeżenie liczy się ponownie, więc są
to liczby otwarć, nie osób.

## Pliki, które eksportujesz

Kopia zapasowa albo eksport trafia tam, dokąd je wyślesz, a aplikacja lub
usługa, która je odbiera, obsługuje je na własnych zasadach. Zaszyfrowaną
kopię zapasową (`.ttbackup`) otwiera tylko hasło do kopii, które ustalasz.
Pozostałe eksporty służą do czytania, udostępniania albo druku, więc nie są
szyfrowane: dane CSV i JSON, książka dziennika, zestawienie dla lekarza,
kolaże zdjęć i filmy poklatkowe, pliki PDF i pliki kalendarza. Każdy, kto
dostanie taki plik, może go odczytać.

## Usuwanie danych

- W aplikacji: Ustawienia -> Prywatność i dane -> Usuń wszystko.
- Na Androidzie: odinstaluj aplikację albo wyczyść jej dane w ustawieniach
  systemu.
- W przeglądarce: wyczyść dane strony `app.engender.barankiewicz.dev`.

Żaden z tych sposobów nie usuwa plików, które już zostały wyeksportowane
albo zapisane jako kopia zapasowa. Usuń je tam, gdzie leżą.

## Wiadomości z prośbą o pomoc

Gdy piszesz na engender-app@pm.me, autorka dostaje twój adres e-mail,
wiadomość i załączniki i używa ich, żeby ci odpowiedzieć. Nie wysyłaj
prawdziwego dziennika, kopii zapasowej, hasła ani klucza odzyskiwania. Jeśli
coś takiego trafi do niej przez pomyłkę, usuwa to, gdy tylko zauważy.
Korespondencja jest usuwana w ciągu 30 dni od rozwiązania zgłoszenia,
a o wcześniejsze usunięcie możesz poprosić.

Zgłoszenia na GitHubie są publiczne i podlegają zasadom GitHuba.

## Wiek

engender jest dla każdej osoby trans. Nie ma dolnej ani górnej granicy
wieku ani weryfikacji wieku.

## Zmiany tej polityki

Gdy polityka się zmienia, zmienia się też data na górze. Wcześniejsze
wersje są w historii pliku
https://github.com/engender-app/engender/blob/main/PRIVACY.pl.md.

Ta polityka jest dostępna również
[po angielsku](https://github.com/engender-app/engender/blob/main/PRIVACY.md).
