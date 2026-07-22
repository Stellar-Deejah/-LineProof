@echo off
echo Creating branch fix/soroban-sdk-deployment...
git checkout -b fix/soroban-sdk-deployment

echo Adding modified and new files...
git add .

echo Committing changes...
git commit -m "fix(sdk): replace synthetic deployFactory with two-step Soroban deployment and contract ID validation"

echo Publishing branch to remote...
git push -u origin fix/soroban-sdk-deployment

echo Done!
pause
