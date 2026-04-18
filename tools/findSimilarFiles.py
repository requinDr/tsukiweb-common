import os

def get_shingles(text, k=5):
  return set(text[i:i+k] for i in range(len(text) - k + 1))

def minhash_similarity(set1, set2):
  if not set1 or not set2: return 0
  intersection = len(set1.intersection(set2))
  union = len(set1.union(set2))
  return intersection / union

def find_similar(threshold=0.95):
  files = [f for f in os.listdir('.') if f.endswith('.txt')]
  data = {}
  
  for f in files:
    try:
      with open(f, 'r', encoding='utf-8') as content:
        data[f] = get_shingles(content.read())
    except:
      continue

  results = []
  filenames = list(data.keys())
  
  for i in range(len(filenames)):
    for j in range(i + 1, len(filenames)):
      f1, f2 = filenames[i], filenames[j]
      sim = minhash_similarity(data[f1], data[f2])
      
      if sim >= threshold:
        results.append((f1, f2, sim))
              
  return results

for f1, f2, s in find_similar():
  print(f"{f1} ≈ {f2} ({s:.1%})")