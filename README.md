# Lyra Hackathon

### Create your branch

```
git switch -c <your-name>
```

### Push new commit

```
git add .
git commit -m "..."
git push -u origin <your-branch>
```

## Job scraper
### Install environment

```
conda create -n hack python=3.11 
conda activate hack
pip install -e .
playwright install chromium
```
### Create session
```
python create_session.py
```
### Run job scraper
Copy `.env.example` to `.env` and add you LinkeIn account

```
python scrape_jobs.py
```