# Search Papers

Quick academic paper search with integrated citation functionality.

## Usage
```
/search-papers <query> [--min-year=YYYY] [--max-year=YYYY] [--count=N]
```

## Examples
```
/search-papers "real estate finance"
/search-papers "machine learning" --min-year=2020 --count=5
/search-papers "behavioral economics" --min-year=2018 --max-year=2023
```

## What it does
1. **Supabase Search**: Execute hybrid search using RPC `hybrid_search_papers_v4`
2. **Citation Integration**: Automatically register papers in citation context
3. **Result Formatting**: Display papers with metadata and scores
4. **DOI Resolution**: Generate accessible URLs from DOI and OpenAlex IDs
5. **Export Ready**: Prepare results for academic citation formats

## Features
- **Semantic Search**: Vector similarity matching
- **Keyword Search**: Traditional text matching  
- **Hybrid Scoring**: Combined semantic + keyword relevance
- **Year Filtering**: Restrict results to specific time periods
- **Citation Counts**: Display paper impact metrics
- **Abstract Previews**: Show truncated abstracts in tooltips

## Output format
Each result includes:
- Title and authors
- Journal and publication year
- Citation count and semantic score
- Abstract preview
- Direct links to full papers
- Automatic citation numbering

## Integration
Results are automatically:
- Added to citation context for inline referencing
- Formatted for academic writing
- Cached for performance
- Ready for export to reference managers