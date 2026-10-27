# PROPERTY FIND — Clean Folder

इस folder में एक ही `index.html` है। पुराने prototype login scripts इसमें शामिल नहीं हैं।

## GitHub Pages पर लगाने के steps
1. ZIP extract करें।
2. GitHub repo `badalwithproperty-ai/Best-Property-find` खोलें।
3. `index.html` खोलकर Edit (पेंसिल) दबाएँ।
4. नई `index.html` का पूरा code paste करके Commit changes करें।
5. 1–3 मिनट बाद live website refresh करें।

## Supabase
1. Supabase Dashboard → SQL Editor में `supabase-setup.sql` खोलकर Run करें।
2. Authentication में Email provider enabled रखें।
3. URL Configuration में Site URL और Redirect URL रखें:
   `https://badalwithproperty-ai.github.io/Best-Property-find/`
4. Email confirmation चालू है तो signup email में confirmation link खोलें।

## सुरक्षा
HTML में केवल publishable key रखें; service_role/secret key कभी नहीं। पहले test data से login, save और refresh जाँचें। Sensitive KYC/bank details न रखें।
