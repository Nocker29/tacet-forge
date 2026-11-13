@echo off
rem Opens the project knowledge graph (graphify) in the default browser.
rem Rebuild it with: graphify update .   (start.bat also refreshes it after an update)
start "" "%~dp0graphify-out\graph.html"
