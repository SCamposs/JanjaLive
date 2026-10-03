!macro customInstall
  WriteRegStr HKCU "Software\Classes\janjalive" "" "URL:janjalive"
  WriteRegStr HKCU "Software\Classes\janjalive" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\janjalive\shell\open\command" "" '"$INSTDIR\JanjaLive.exe" "%1"'
!macroend
