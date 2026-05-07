import { test, expect, describe } from 'bun:test';

const BASE_URL = process.env.JUNCTION_BOX_URL || 'http://localhost:3001';

async function exec(graph) {
  const res = await fetch(`${BASE_URL}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graph),
  });
  return res.json();
}

describe('Extension Smoke Tests', () => {
  test('analyze: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'analyze', type: 'analyze', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'analyze', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('db-query: smoke test', async () => {
    const graph = {
      nodes: [
        { id: 'db-query', type: 'db-query', params: { query: 'SELECT run_id, status FROM runs_v LIMIT 5' } },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        { from: 'db-query', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('display: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'display', type: 'display', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'display', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('example-echo: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'example-echo', type: 'example-echo', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'example-echo', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('fear-greed-history: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'fear-greed-history', type: 'fear-greed-history', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'fear-greed-history', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('fear-greed-now: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'fear-greed-now', type: 'fear-greed-now', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'fear-greed-now', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('file-out: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'file-out', type: 'file-out', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'file-out', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('glob: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'glob', type: 'glob', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'glob', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('hn-comments: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'hn-comments', type: 'hn-comments', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'hn-comments', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('hn-search: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'hn-search', type: 'hn-search', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'hn-search', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('http-delete: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'http-delete', type: 'http-delete', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'http-delete', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('http-head: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'http-head', type: 'http-head', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'http-head', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('http-patch: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'http-patch', type: 'http-patch', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'http-patch', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('http-post: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'http-post', type: 'http-post', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'http-post', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('http-put: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'http-put', type: 'http-put', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'http-put', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('llm: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'llm', type: 'llm', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'llm', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('ls: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'ls', type: 'ls', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'ls', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('market-history: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'market-history', type: 'market-history', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'market-history', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('market-options: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'market-options', type: 'market-options', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'market-options', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('market-screener: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'market-screener', type: 'market-screener', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'market-screener', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('market-snapshot: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'market-snapshot', type: 'market-snapshot', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'market-snapshot', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('market-symbols: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'market-symbols', type: 'market-symbols', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'market-symbols', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('mkdir: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'mkdir', type: 'mkdir', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'mkdir', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('path-join: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'path-join', type: 'path-join', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'path-join', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('path-parse: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'path-parse', type: 'path-parse', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'path-parse', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('reddit-comments: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'reddit-comments', type: 'reddit-comments', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'reddit-comments', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('reddit-search: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'reddit-search', type: 'reddit-search', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'reddit-search', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('reddit-subreddit: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'reddit-subreddit', type: 'reddit-subreddit', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'reddit-subreddit', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('return: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'return', type: 'return', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'return', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('rm: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'rm', type: 'rm', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'rm', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('rss-feed: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'rss-feed', type: 'rss-feed', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'rss-feed', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('sec-10k: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'sec-10k', type: 'sec-10k', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'sec-10k', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('sec-10q: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'sec-10q', type: 'sec-10q', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'sec-10q', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('sec-8k: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'sec-8k', type: 'sec-8k', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'sec-8k', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('sec-earnings: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'sec-earnings', type: 'sec-earnings', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'sec-earnings', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('sec-filing: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'sec-filing', type: 'sec-filing', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'sec-filing', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('sec-insider: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'sec-insider', type: 'sec-insider', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'sec-insider', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('sec-proxy: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'sec-proxy', type: 'sec-proxy', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'sec-proxy', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('template-api: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'template-api', type: 'template-api', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'template-api', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('template-multi: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'template-multi', type: 'template-multi', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'template-multi', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('template-source: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'template-source', type: 'template-source', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'template-source', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('template-transform: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'template-transform', type: 'template-transform', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'template-transform', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('to-csv: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'to-csv', type: 'to-csv', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'to-csv', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('to-json: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'to-json', type: 'to-json', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'to-json', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('to-nuon: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'to-nuon', type: 'to-nuon', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'to-nuon', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('to-text: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'to-text', type: 'to-text', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'to-text', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('web-htmd: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'web-htmd', type: 'web-htmd', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'web-htmd', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('wiki-search: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'wiki-search', type: 'wiki-search', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'wiki-search', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('wiki-section: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'wiki-section', type: 'wiki-section', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'wiki-section', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('wiki-sections: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'wiki-sections', type: 'wiki-sections', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'wiki-sections', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('wiki-summary: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'wiki-summary', type: 'wiki-summary', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'wiki-summary', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('wiki-table: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'wiki-table', type: 'wiki-table', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'wiki-table', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('youtube-channel: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'youtube-channel', type: 'youtube-channel', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'youtube-channel', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('youtube-playlist: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'youtube-playlist', type: 'youtube-playlist', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'youtube-playlist', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('youtube-search: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'youtube-search', type: 'youtube-search', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'youtube-search', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('youtube-transcript: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'youtube-transcript', type: 'youtube-transcript', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'youtube-transcript', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });

  test('youtube-video: smoke test', async () => {
    const graph = {
      nodes: [
        
        { id: 'youtube-video', type: 'youtube-video', params: {} },
        { id: 'out', type: 'return', params: {} }
      ],
      edges: [
        
        { from: 'youtube-video', from_port: 'output', to: 'out', to_port: 'input' }
      ]
    };
    const res = await exec(graph);
    expect(res.status).toBeDefined();
  });
});
