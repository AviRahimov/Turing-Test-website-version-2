



# Setup Env

1. Navigate to the app folder:

```bash
cd Turing-Test-website-version-2/
```

2. Create virtual env:

```bash 
rm -rf venv
python3.12 -m venv venv
source venv/bin/activate
```

3. Install requirements:

```bash
pip install -r requirements.txt
```

# Setup Frontend Project

1. Navigate to the frontend folder

```bash
cd frontend/
```

2. Install npm
```bash
npm install
```

3. Build the react project
```bash
npm run build
```

4. Copy the new build folder to the backend folder
```bash
cd ..
cp -r frontend/build backend/
```


# How to run

```bash
python3 app.py
```

# My env pip list
![pip list](pip_list_updated.png)