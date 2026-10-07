# Polityka prywatności

Ostatnia aktualizacja: 7 października 2026

engender to dziennik tranzycji. Tworzy go i publikuje Alicja Barankiewicz
z Warszawy. Ta polityka dotyczy aplikacji w przeglądarce i na Androida,
strony internetowej, przewodnika, korespondencji w sprawie pomocy oraz
plików, które eksportujesz lub udostępniasz.

## Kontakt

Pytania o tę politykę albo o twoje dane:

- e-mail: engender-app@pm.me
- błędy i ogólne pytania: https://github.com/engender-app/engender/issues
- problemy z bezpieczeństwem: https://github.com/engender-app/engender/blob/main/SECURITY.md

Żeby dostać pomoc, nigdy nie trzeba wysyłać treści dziennika, kopii
zapasowej ani klucza.

## W skrócie

engender nie ma kont ani serwera z kopiami dzienników. Dziennik zostaje na
twoim urządzeniu, dopóki go nie wyeksportujesz lub nie udostępnisz. Jego
baza i media są zaszyfrowane na urządzeniu. Autorka nie może odzyskać ich
za ciebie.

Strona i aplikacja w przeglądarce zliczają otwarcia przy połączeniu z siecią,
bez profili odwiedzających. Liczniki nie zawierają danych z dziennika.
Android nie wysyła takich zgłoszeń. Osobno opisujemy poniżej wiadomości,
które dobrowolnie wysyłasz, prosząc o pomoc.

## Co aplikacja przechowuje i gdzie

Wszystko, co wpisujesz, zostaje w pamięci aplikacji na twoim urządzeniu:
wpisy, notatki i nastroje, skale, dawki i schematy dawkowania, wyniki badań,
pomiary, wizyty, kamienie milowe, listy, zdjęcia, nagrania głosowe i wideo,
zaimportowane dokumenty, przypomnienia i ustawienia. Baza dziennika i zdjęcia
są zaszyfrowane na urządzeniu. Nic z tego nie trafia do autorki aplikacji ani
do nikogo innego.

Część ustawień potrzebnych przed odblokowaniem, w tym motyw, paleta, język,
kamuflaż i czas blokady, pozostaje poza zaszyfrowanym dziennikiem. Na
Androidzie aplikacja aparatu zapisuje zdjęcie tymczasowo w niezaszyfrowanym
pliku pamięci podręcznej, zanim engender je zaimportuje i zaszyfruje.
Szyfrowanie dziennika nie oznacza szyfrowania każdego ustawienia i pliku
tymczasowego.

Aplikacja w przeglądarce i aplikacja na Androida mają osobne dzienniki. Żeby
przenieść dziennik z jednej do drugiej, eksportujesz zaszyfrowaną kopię
zapasową i ją importujesz.

## Aplikacja w przeglądarce

Aplikacja działa pod adresem `app.engender.barankiewicz.dev`. Kiedy
przeglądarka ją wczytuje albo sprawdza aktualizacje, serwer widzi zwykłe dane
każdego żądania:

- adres IP,
- czas żądania,
- żądany adres URL wraz z parametrami oraz rozmiar odpowiedzi,
- nagłówki User-Agent i Referer wysłane przez przeglądarkę.

Aplikację udostępnia serwer VPS w OVH. Zwykłe dzienniki dostępu są wyłączone.
Dzienniki błędów mogą zawierać adres IP i żądany URL; serwer przechowuje je
najwyżej przez siedem dni. Żądania licznika otwarć nie trafiają do logów.

Aplikacja nie wysyła dziennika i nie zakłada konta ani profilu odwiedzającej
osoby. Licznik otwarć opisujemy poniżej. Czcionki i pliki do rozpoznawania tekstu aplikacja pobiera
z tego samego serwera i nie łączy się z żadną inną stroną. Przy pierwszym
skanowaniu zdjęcia wyników przeglądarka pobiera z tego serwera silnik OCR
(około 21 MB). Samo rozpoznawanie tekstu odbywa się na twoim urządzeniu.

W przeglądarce lokalny dziennik otwiera się na jeden z czterech sposobów:

- hasłem do dziennika, z którego Argon2id wyprowadza klucz,
- czterocyfrowym kodem PIN, połączonym z kluczem przypisanym do tego profilu
  przeglądarki,
- biometrią w przeglądarkach, które obsługują rozszerzenie WebAuthn PRF
  (Touch ID, Windows Hello albo blokada urządzenia),
- kluczem zapisanym w tym profilu przeglądarki, który otwiera dziennik bez
  pytania.

PIN, biometria i klucz w przeglądarce zależą od kluczy zapisanych w tym
profilu przeglądarki. Po wyczyszczeniu danych strony, zresetowaniu profilu
albo utracie urządzenia tej kopii dziennika nie da się już odczytać.

Możesz też utworzyć opcjonalny, 25-znakowy klucz odzyskiwania. Otwiera
dziennik na tym samym urządzeniu i w tym samym profilu przeglądarki, gdy
hasło, PIN albo biometria przestaną działać. Nie przeniesie danych na nowe
urządzenie i nie otworzy eksportu. Aplikacja pokazuje go raz i przechowuje
tylko zaszyfrowaną kopię klucza dziennika. Trzymaj klucz odzyskiwania na
papierze albo w menedżerze haseł na innym urządzeniu: każdy, kto ma ten klucz
i dane dziennika, może dziennik odczytać. Klucz nie przywróci usuniętych
danych.

Gdy kopiujesz klucz odzyskiwania w przeglądarce, aplikacja po minucie
próbuje usunąć go ze schowka, jeśli nadal tam jest. Przeglądarka może na to
nie pozwolić, a menedżer schowka albo synchronizacja mogą już mieć kopię.

## Strona internetowa i przewodnik

Strona, przewodnik i ta polityka pod adresem `engender.barankiewicz.dev`
korzystają z hostingu lh.pl. Strona zapamiętuje język i motyw w lokalnej
pamięci przeglądarki dla tej domeny, oddzielnie od dziennika.

lh.pl przechowuje dzienniki dostępu i błędów na swoim serwerze kopii
zapasowych. Mogą zawierać adresy IP, żądane adresy URL i nagłówki przeglądarki.

## Licznik otwarć

Strona i aplikacja w przeglądarce wysyłają jedno puste żądanie przy otwarciu
dokumentu z połączeniem z siecią. Liczy się też otwarcie zapisanej w pamięci
podręcznej aplikacji, jeśli urządzenie jest online. Przechodzenie między
ekranami nie wysyła kolejnych zgłoszeń. Otwarcia bez sieci i aplikacja na
Androida nie są zliczane. Nieudane zgłoszenia nie są ponawiane ani zapisywane
na później.

Żądanie trafia pod stały adres. Nie zawiera danych dziennika, nazwy otwartej
strony, parametrów adresu, strony odsyłającej ani ciasteczek. Serwer, który
je odbiera, widzi adres IP połączenia i zwykłe nagłówki przeglądarki. Usuwa
te dane przed przekazaniem stałej etykiety, aplikacja albo strona, do własnej
instancji GoatCounter. Znane boty są odfiltrowywane, gdy można je rozpoznać.

GoatCounter zachowuje sumy godzinowe dla tych dwóch etykiet. Można je oglądać
w podziale na dni. Są dostępne tylko dla autorki i pozostają bezterminowo.
Śledzenie sesji i zapis pojedynczych odsłon są wyłączone. Nie ma
identyfikatorów odwiedzających, liczby unikalnych osób ani podziału według
lokalizacji czy urządzenia. Odświeżenie liczy się ponownie: są to liczby
otwarć, nie osób. Logowanie administratorki do statystyk jest oddzielne od
aplikacji i korzysta z ciasteczka uwierzytelniającego. Licznik nie ustawia
tego ciasteczka osobom odwiedzającym.

## Aplikacja na Androida

Wydawanie aplikacji na Androida zaczyna się od plików APK na GitHubie.
Google Play i F-Droid mają osobne procesy publikacji. Sklep lub serwis
pobierania widzi kierowane do niego żądania i obsługuje je według własnych
zasad.

Aplikacja na Androida nie prosi o uprawnienie `INTERNET`. Nie otwiera
połączeń sieciowych i niczego nie wysyła na żaden serwer. Wyłącza też kopię
zapasową Androida w chmurze i przenoszenie danych między telefonami, więc
system nie kopiuje jej danych do Google ani na nowy telefon.

Aplikacja prosi o następujące uprawnienia:

- `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` i `RECEIVE_BOOT_COMPLETED`,
  żeby przypomnienie albo codzienne pytanie pojawiło się o wybranej
  godzinie, a nie w zbiorczym oknie systemu, także po restarcie telefonu.
- `RECORD_AUDIO` i `MODIFY_AUDIO_SETTINGS`, do notatek głosowych, ćwiczeń
  głosu i dźwięku w notatkach wideo.
- `CAMERA`, do notatek wideo i do robienia zdjęć. Zdjęcie robi aplikacja
  aparatu, a engender prosi o to uprawnienie przed jej otwarciem, bo
  Android wymaga tego od aplikacji, która je deklaruje.
- `USE_BIOMETRIC` i `USE_FINGERPRINT`, które dodaje biblioteka biometryczna
  AndroidX, żeby aplikacja mogła pokazać systemowe pytanie o odcisk palca,
  twarz albo blokadę ekranu przed otwarciem dziennika. Aplikacja nie widzi
  odcisku palca ani twarzy. Android przekazuje jej tylko, czy weryfikacja się
  udała.

Android pokazuje też `dev.engender.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
To nie jest prośba do ciebie: AndroidX deklaruje to uprawnienie, żeby
wewnętrzne komunikaty aplikacji mogła wysyłać tylko ona sama.

Przypomnienia i codzienne pytanie domyślnie pokazują tylko ogólny tytuł,
nawet na zablokowanym ekranie. Ustawienie w sekcji Powiadomienia to wyłącza
i pokazuje prawdziwy tytuł.

Na Androidzie 13 i nowszym aplikacja oznacza skopiowany klucz odzyskiwania
jako wrażliwy. To prośba do klawiatury, żeby nie zapisywała go w historii
schowka. Po minucie aplikacja usuwa klucz ze schowka, a jeśli wcześniej z niej
wyjdziesz, robi to po powrocie. Nigdy nie usuwa niczego, co skopiujesz
później.

Na Androidzie dziennik otwiera się na jeden z czterech sposobów:

- kluczem chronionym przez Android Keystore, który system wydaje po
  blokadzie ekranu albo weryfikacji biometrycznej,
- kluczem chronionym przez Android Keystore, który system wydaje bez
  pytania; dziennik i tak jest zaszyfrowany przez SQLCipher,
- czterocyfrowym kodem PIN, połączonym z kluczem w Android Keystore,
- hasłem do dziennika, z którego Argon2id wyprowadza klucz.

Kluczy z Android Keystore nie da się skopiować z telefonu. Po utracie
telefonu albo wyczyszczeniu danych aplikacji tej kopii dziennika nie da się
odczytać. Opcjonalny klucz odzyskiwania otworzy dziennik na tym samym
telefonie, gdy odblokowanie zawiedzie, ale niczego nie przywróci, jeśli
telefon albo jego pamięć przepadną.

## Kopie zapasowe, eksporty i udostępniane pliki

Kiedy eksportujesz albo udostępniasz plik, wybierasz, dokąd trafi.
Udostępnione pliki i linki obsługują inne aplikacje, które mogą korzystać
z sieci. Jeśli zapiszesz plik na dysku w chmurze albo u innego dostawcy
dokumentów, ten dostawca może widzieć nazwę pliku, czas zapisu, rozmiar
i dzienniki dostępu do twojego konta.

### Zaszyfrowane kopie zapasowe

Zaszyfrowana kopia zapasowa (`.ttbackup`), eksportowana ręcznie albo
zapisywana przez Androida według harmonogramu w wybranym folderze, jest
szyfrowana algorytmem AES-GCM hasłem, które ustalasz. Bez tego hasła nikt jej
nie odczyta.

### Eksporty do czytania

Niektóre eksporty celowo nie są szyfrowane, bo służą do czytania,
udostępniania albo druku:

- pliki CSV i JSON eksportowane w Ustawieniach,
- pamiątkowa książka dziennika przygotowana do druku albo do PDF,
- zestawienie dla lekarza ze schematami dawkowania, pomiarami, wynikami badań
  i notatkami,
- kolaże zdjęć i filmy poklatkowe,
- karty podsumowań udostępniane jako obrazy,
- dokumenty PDF zapisane z powrotem w pamięci urządzenia,
- pojedyncze pliki kalendarza (`.ics`) z terminami wizyt, operacji albo
  kamieni milowych.

Każdy, kto dostanie taki plik albo wydruk, może odczytać jego treść. Zanim
aplikacja zapisze niezaszyfrowany plik, prosi o potwierdzenie albo wymaga
wyraźnego kroku.

## Linki prowadzące poza aplikację

Linki Strona, Przewodnik, Polityka prywatności i Kod źródłowy w sekcji
O aplikacji otwierają się w przeglądarce. Prowadzą do
`engender.barankiewicz.dev` i `github.com`, które widzą to żądanie jak każda
inna strona. Strony na GitHubie podlegają jego własnej polityce prywatności.

## Usuwanie danych

Aplikacja nie wysyła dziennika do autorki. Możesz samodzielnie usunąć jego
lokalną kopię. Wiadomości z prośbą o pomoc i logi hostingu mają osobne
okresy przechowywania, opisane w tej polityce:

- **W aplikacji.** Ustawienia, potem Prywatność i dane, potem Usuń wszystko.
  To usuwa dziennik, zdjęcia i nagrania, ustawienia, zaplanowane
  przypomnienia i klucze, które otwierają dziennik. Tego nie da się cofnąć.
  Jeśli w przeglądarce używasz odblokowania biometrycznego, utworzony dla
  niego klucz dostępu zostaje na liście kluczy w przeglądarce albo na
  urządzeniu, dopóki go stamtąd nie usuniesz. Po usunięciu dziennika niczego
  już nie otwiera. Na Androidzie przerwane robienie zdjęcia może zostawić niezaszyfrowany plik w pamięci podręcznej aplikacji. Wyczyszczenie danych aplikacji usuwa ten plik.
- **Na Androidzie.** Odinstalowanie aplikacji albo wyczyszczenie jej danych
  w ustawieniach systemu usuwa wszystko, co aplikacja zapisała w telefonie.
- **W przeglądarce.** Wyczyszczenie danych strony
  `app.engender.barankiewicz.dev` usuwa dziennik i jego klucze.

Żaden z tych sposobów nie usuwa plików, które wyeksportujesz albo
udostępnisz, w tym kopii zapasowych zapisywanych według harmonogramu we
wskazanym folderze. Je usuń tam, gdzie zostały zapisane.

## Utracone klucze i hasła

Autorka aplikacji nie odzyska zapomnianego hasła do dziennika, kodu PIN ani
hasła do kopii zapasowej. Nie odzyska też utraconego klucza urządzenia ani
klucza odzyskiwania.

## Dla kogo jest aplikacja

engender jest dla każdej osoby trans, także nastoletniej. Korzystanie z
dziennika nie ma dolnej granicy wieku ani procesu jego weryfikacji.
Deklaracje odbiorców i treści w sklepach mają opisywać aplikację zgodnie z
prawdą. Nie zmieniają sposobu przechowywania lokalnego dziennika.

## Wiadomości z prośbą o pomoc

Gdy piszesz na engender-app@pm.me, autorka otrzymuje twój adres e-mail,
wiadomość i załączniki przez Proton Mail. Używa ich do odpowiedzi na
zgłoszenie. Nie wysyłaj prawdziwego dziennika, kopii zapasowej, hasła,
klucza odzyskiwania ani zrzutu ekranu z osobistymi danymi. Do pomocy
wystarczają wersje aplikacji i urządzenia, kroki odtworzenia problemu oraz
wymyślone przykłady.

Prywatna korespondencja i pobrane kopie pod kontrolą autorki są usuwane w
ciągu 30 dni od rozwiązania zgłoszenia. Osobiste dane dziennika wysłane
przez pomyłkę są usuwane po zauważeniu; nie służą do badania problemu.
Techniczne ustalenia mogą pozostać w zgłoszeniach bez osobistych treści
z dziennika. Pod podanym adresem możesz też zapytać o korespondencję lub
poprosić o jej usunięcie.

Zgłoszenia błędów na GitHubie są publiczne. Problemy z bezpieczeństwem
zgłasza się przez prywatny formularz tej usługi. Ich widoczność i okres
przechowywania zależą od zasad i możliwości GitHuba. Autorka nie może
obiecać usunięcia danych z jego systemów, kopii dostawców ani egzemplarzy
posiadanych przez inne osoby.

## Zmiany tej polityki

Gdy polityka się zmienia, zmienia się też data na górze. Wszystkie
wcześniejsze wersje są w historii pliku
https://github.com/engender-app/engender/blob/main/docs/privacy-policy.pl.md.

Ta polityka jest dostępna również
[po angielsku](https://github.com/engender-app/engender/blob/main/docs/privacy-policy.en.md).
