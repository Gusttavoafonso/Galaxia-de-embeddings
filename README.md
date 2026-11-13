<p align="center">
  <img src="docs/hero.gif" alt="Uma pergunta é digitada, vira uma estrela dourada e a câmera voa até os artigos mais próximos" width="100%">
</p>

# Galáxia de Embeddings

**Um mapa 3D do conhecimento.** 52.260 artigos de Ciência da Computação do arXiv viram estrelas; os temas viram 82 constelações, batizadas por um LLM. Você digita uma pergunta, ela aparece como uma estrela dourada, a câmera voa até a vizinhança dela e um RAG responde usando as estrelas próximas.

**Demo:** https://gusttavoafonso.github.io/Galaxia-de-embeddings/ (depois de ativar o GitHub Pages; veja [Publicando](#publicando)).

| A pergunta vira uma estrela | Cada constelação é um tema | Temas nascendo ao longo do tempo |
|:--:|:--:|:--:|
| ![Pergunta, voo da câmera e resposta com fontes](docs/pergunta.png) | ![Painel de uma constelação](docs/constelacao.png) | ![Linha do tempo](docs/tempo.png) |

## O que tem aqui

- **Busca semântica 100% no navegador.** O mesmo modelo que gerou os embeddings (`all-MiniLM-L6-v2`) roda em WebAssembly via transformers.js. A pergunta é comparada com todos os documentos em um índice int8 de 20 MB, sem servidor.
- **A pergunta cai no mapa.** A posição 3D dela é a média das vizinhas mais próximas no espaço original de 384 dimensões, ponderada pela similaridade.
- **RAG com citações.** Com o backend ligado, o Claude responde em streaming usando só os resumos vizinhos, e cada `[n]` da resposta leva à estrela correspondente. Sem backend (GitHub Pages), o site destaca a frase mais relevante de cada resumo.
- **Linha do tempo.** Aperte play e veja a galáxia se formar de 2012 a 2026: estrelas acendem na data de publicação e o painel "em alta" mostra as constelações que mais crescem em cada momento.
- **Constelações navegáveis.** Clique em um nome para ver palavras-chave, a fatia do tema no corpus ao longo dos anos e os artigos mais centrais.

## Como funciona

```
arXiv API ──► sentence-transformers ──► UMAP 3D ──────────► posição das estrelas
 (título +        (384 dimensões)   └──► UMAP 8D ► HDBSCAN ► constelações
  resumo)                                              └──► c-TF-IDF ► LLM ► nomes
                         │
                         └──► int8 ──► índice vetorial no navegador
                                              ▲
pergunta ──► transformers.js (ONNX/WASM) ─────┘──► top-k ──► voo da câmera ──► RAG
```

| Etapa | Arquivo | O que faz |
|---|---|---|
| 1 | `pipeline/01_fetch_arxiv.py` | Amostra estratificada por mês da API do arXiv (`cat:cs.*`), retomável |
| 2 | `pipeline/02_embed.py` | Embeddings normalizados de título + resumo |
| 3 | `pipeline/03_reduce_cluster.py` | UMAP 3D (visual), UMAP 8D + HDBSCAN (clusters), c-TF-IDF, desenho das constelações |
| 4 | `pipeline/04_name_clusters.py` | Claude nomeia e descreve cada cluster (saída estruturada) → `cluster_names.json` |
| 5 | `pipeline/05_export.py` | Empacota tudo em binários estáticos para o site |
| — | `web/` | Three.js com shaders próprios, bloom, busca e interface |
| — | `server/app.py` | FastAPI: RAG em streaming com o Claude |

### Decisões que valem a leitura

- **Agrupar em 8D, visualizar em 3D.** HDBSCAN em 3D perde estrutura; em 384D sofre com a maldição da dimensionalidade. Duas UMAPs separadas resolvem: uma otimizada para densidade (`min_dist=0`), outra para o olho.
- **PCA no índice foi descartada com medição.** Reduzir para 96 dimensões deixaria o índice 4x menor, mas o recall@10 caía para 73%. Quantizar os 384 valores em int8 manteve 98,8% com 1/4 do tamanho do float32.
- **17,7% dos artigos não pertencem a constelação nenhuma.** O HDBSCAN sozinho marcava 36% como ruído, quase tudo "halo" em volta de núcleos densos. Um voto de vizinhos adota quem está claramente dentro de um tema (60% dos 15 vizinhos concordam); quem fica entre temas continua como poeira cinza, em vez de ser forçado para o cluster mais próximo.
- **O servidor não confia no cliente.** O navegador manda só a pergunta e os ids das fontes; o backend lê os resumos do próprio disco. Assim o endpoint não vira um proxy aberto para o LLM. Há também limite de requisições por IP.
- **A posição da pergunta é uma aproximação.** A UMAP não tem transformação inversa barata no navegador, então a pergunta é posicionada pelos vizinhos no espaço original, que é o que de fato define a resposta.

## Rodando

**Só o site** (os dados já estão em `web/public/data`):

```bash
cd web && npm install && npm run build && npm run preview
```

Use `build` + `preview`: o runtime ONNX é servido da pasta `public/`, o que o servidor de desenvolvimento do Vite não permite para módulos.

**Com respostas do LLM:**

```bash
pip install -r server/requirements.txt
```

```bash
cd server && ANTHROPIC_API_KEY=... uvicorn app:app --port 8000
```

Abra `http://localhost:8000`: o FastAPI serve o site de `web/dist` e a API em `/api`. Para um site hospedado em outro lugar apontar para a API, faça o build com `VITE_API_URL=https://sua-api` e libere a origem em `GALAXIA_ORIGINS`.

**Refazendo a galáxia com outro corpus:**

```bash
pip install -r pipeline/requirements.txt
```

```bash
cd pipeline && python 01_fetch_arxiv.py && python 02_embed.py && python 03_reduce_cluster.py && python 04_name_clusters.py && python 05_export.py
```

Os parâmetros (consulta, período, modelo, UMAP, HDBSCAN) ficam em `pipeline/config.py`. Qualquer corpus serve se a etapa 1 gerar `data/raw/*.jsonl` com `id`, `title`, `abstract`, `date`, `cat` e `authors`.

## Publicando

O workflow `.github/workflows/pages.yml` faz o build e publica `web/dist` a cada push na `main`. Para ligar: **Settings → Pages → Source → GitHub Actions**. No Pages o site roda no modo estático (busca semântica no navegador, sem LLM). Para ter as respostas do Claude, suba `server/app.py` em um serviço como o Render e faça o build com `VITE_API_URL` apontando para ele.

## Limitações

- Os nomes das 82 constelações em `pipeline/cluster_names.json` foram escritos pelo Claude a partir das palavras-chave e dos títulos centrais de cada cluster, em uma sessão do Claude Code. A etapa 4 faz o mesmo via API, mas ainda não foi executada com uma chave real, assim como o caminho de resposta do LLM em `server/app.py`, que foi testado apenas contra um endpoint simulado.

- O corpus e o modelo de embeddings são em inglês; perguntas em português funcionam mal na busca.
- É uma amostra (52.260 de milhões de artigos), então a resposta reflete o que foi amostrado, não toda a literatura.
- A primeira pergunta baixa o modelo (~23 MB) e o índice (20 MB); depois ficam em cache.

## Stack

Python · sentence-transformers · UMAP · HDBSCAN · scikit-learn · Three.js · transformers.js · FastAPI · Claude API
