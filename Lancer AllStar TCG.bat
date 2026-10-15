@echo off
rem Double-clique sur ce fichier pour lancer le site, puis laisse cette fenetre ouverte.
cd /d "%~dp0"
title AllStar TCG
start "" http://localhost:5173
node server.mjs
pause
