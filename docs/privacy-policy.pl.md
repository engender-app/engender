# Polityka prywatności

Ostatnia aktualizacja: 5 października 2026

engender to dziennik tranzycji. Tworzy go i publikuje Alicja Barankiewicz
z Warszawy. Ta polityka dotyczy aplikacji w przeglądarce, aplikacji na
Androida i plików, które z nich eksportujesz lub udostępniasz.

## Kontakt

Pytania o tę politykę albo o twoje dane:

- e-mail: [OPEN: adres kontaktowy, do wybrania przed wydaniem]
- błędy i ogólne pytania: https://github.com/engender-app/engender/issues
- problemy z bezpieczeństwem: https://github.com/engender-app/engender/blob/main/SECURITY.md

Żeby dostać pomoc, nigdy nie trzeba wysyłać treści dziennika, kopii
zapasowej ani klucza.

## W skrócie

engender nie ma kont, serwera z dziennikami, analityki ani śledzenia.
Wszystko, co zapiszesz, zostaje zaszyfrowane na urządzeniu, na którym to
zapisujesz, chyba że to wyeksportujesz. Autorka aplikacji nigdy tego
nie dostaje i nie może tego odczytać.

## Co aplikacja przechowuje i gdzie

Wszystko, co wpisujesz, zostaje w pamięci aplikacji na twoim urządzeniu:
wpisy, notatki i nastroje, skale, dawki i schematy dawkowania, wyniki badań,
pomiary, wizyty, kamienie milowe, listy, zdjęcia, nagrania głosowe i wideo,
zaimportowane dokumenty, przypomnienia i ustawienia. Baza dziennika i zdjęcia
są zaszyfrowane na urządzeniu. Nic z tego nie trafia do autorki aplikacji ani
do nikogo innego.

Aplikacja w przeglądarce i aplikacja na Androida mają osobne dzienniki. Żeby
przenieść dziennik z jednej do drugiej, eksportujesz zaszyfrowaną kopię
zapasową i ją importujesz.

## Aplikacja w przeglądarce

Aplikacja działa pod adresem `app.engender.barankiewicz.dev`. Kiedy
przeglądarka ją wczytuje albo sprawdza aktualizacje, serwer widzi zwykłe dane
każdego żądania:

- adres IP,
- czas żądania,
- pobierane pliki i ich rozmiary,
- nagłówki User-Agent i Referer wysłane przez przeglądarkę.

[OPEN: jak długo serwer przechowuje te dzienniki żądań i czy w ogóle je
zapisuje.]

Serwer nie dostaje kont, identyfikatorów profilu, danych analitycznych ani
treści dziennika. Czcionki i pliki do rozpoznawania tekstu aplikacja pobiera
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

## Aplikacja na Androida

Aplikację na Androida można pobrać z Google Play, z F-Droid albo jako plik
APK z GitHuba. Każdy z tych kanałów ma własne zasady i na ich podstawie widzi
instalacje i aktualizacje.

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
  aparatu, ale gdy aplikacja deklaruje to uprawnienie, Android wymaga go
  także przy takim zdjęciu.
- `USE_BIOMETRIC` i `USE_FINGERPRINT`, które dodaje biblioteka biometryczna
  AndroidX, żeby aplikacja mogła pokazać systemowe pytanie o odcisk palca,
  twarz albo blokadę ekranu przed otwarciem dziennika. Aplikacja nie widzi
  odcisku palca ani twarzy. Android przekazuje jej tylko, czy weryfikacja się
  udała.

Android pokazuje też `dev.engender.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
To nie jest prośba do ciebie: AndroidX deklaruje to uprawnienie, żeby
wewnętrzne komunikaty aplikacji mogła wysyłać tylko ona sama. [OPEN:
sprawdzone na scalonym manifeście z 30 sierpnia, jeszcze pod starym
identyfikatorem aplikacji; potwierdzić nazwę na świeżym buildzie wydania.]

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

Autorka aplikacji nie ma żadnych danych z twojego dziennika, więc nie ma
kogo prosić o ich usunięcie. Wszystko na urządzeniu możesz usunąć samodzielnie:

- **W aplikacji.** Ustawienia, potem Prywatność i dane, potem Usuń wszystko.
  To usuwa dziennik, zdjęcia i nagrania, ustawienia, zaplanowane
  przypomnienia i klucze, które otwierają dziennik. Tego nie da się cofnąć.
  Jeśli w przeglądarce używasz odblokowania biometrycznego, utworzony dla
  niego klucz dostępu zostaje na liście kluczy w przeglądarce albo na
  urządzeniu, dopóki go stamtąd nie usuniesz. Po usunięciu dziennika niczego
  już nie otwiera. [OPEN: na Androidzie zdjęcie, którego robienie się nie
  zakończyło, może zostać niezaszyfrowane w pamięci podręcznej aplikacji,
  dopóki nie wejdzie poprawka z zadania after-release 11 (audyt SEC-03).
  Wprowadzić ją przed wydaniem albo zostawić to zdanie z zastrzeżeniem.]
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

## Dzieci

[OPEN: dla kogo jest aplikacja pod względem wieku. Wpis w Google Play ma być
tylko dla dorosłych; napisać to tutaj, gdy zapadnie decyzja.]

## Zmiany tej polityki

Gdy polityka się zmienia, zmienia się też data na górze. Wszystkie
wcześniejsze wersje są w historii pliku
https://github.com/engender-app/engender/blob/main/docs/privacy-policy.pl.md.

Ta polityka jest dostępna również
[po angielsku](https://github.com/engender-app/engender/blob/main/docs/privacy-policy.en.md).
