@echo off
echo.
echo  ========================================
echo   KIM YAPTI? - Sunucu Baslatiliyor
echo  ========================================
echo.
node -e "const os=require('os');const i=Object.values(os.networkInterfaces()).flat().find(i=>i.family==='IPv4'&&!i.internal);console.log('  Tablet icin: http://' + (i?i.address:'localhost') + ':3457/');"
echo.
echo  Kapat: Bu pencereyi kapat = sunucu durur
echo  ========================================
echo.
node server.js
pause
