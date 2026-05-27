import { UrlNormalizerService } from './url-normalizer.service';

describe('UrlNormalizerService', () => {
  let svc: UrlNormalizerService;

  beforeEach(() => {
    svc = new UrlNormalizerService();
  });

  describe('host normalization', () => {
    it('lowercases the hostname', () => {
      expect(svc.normalize('https://EXAMPLE.COM/article')).toContain('example.com');
    });

    it('preserves the path casing while lowercasing only the host', () => {
      expect(svc.normalize('https://Blog.EXAMPLE.com/The-Article')).toBe(
        'https://blog.example.com/The-Article',
      );
    });
  });

  describe('tracking param stripping', () => {
    it('strips utm_source', () => {
      const url = 'https://example.com/article?utm_source=newsletter&id=42';
      expect(svc.normalize(url)).toBe('https://example.com/article?id=42');
    });

    it('strips utm_medium, utm_campaign, utm_content, utm_term', () => {
      const url =
        'https://example.com/p?utm_medium=social&utm_campaign=spring&utm_content=a&utm_term=b&real=1';
      expect(svc.normalize(url)).toBe('https://example.com/p?real=1');
    });

    it('strips fbclid', () => {
      const url = 'https://example.com/p?fbclid=abc123&id=1';
      expect(svc.normalize(url)).toBe('https://example.com/p?id=1');
    });

    it('strips gclid', () => {
      const url = 'https://example.com/p?gclid=xyz&id=1';
      expect(svc.normalize(url)).toBe('https://example.com/p?id=1');
    });

    it('strips ref and source params', () => {
      const url = 'https://example.com/p?ref=twitter&source=feed&id=1';
      expect(svc.normalize(url)).toBe('https://example.com/p?id=1');
    });

    it('preserves non-tracking params', () => {
      const url = 'https://example.com/p?page=2&category=tech';
      const result = svc.normalize(url);
      expect(result).toContain('page=2');
      expect(result).toContain('category=tech');
    });
  });

  describe('trailing slash', () => {
    it('removes trailing slash from non-root paths', () => {
      expect(svc.normalize('https://example.com/article/')).toBe('https://example.com/article');
    });

    it('preserves root slash (URL semantics)', () => {
      // URL("https://example.com/").toString() always re-emits "https://example.com/".
      // The service only strips trailing slashes on paths longer than 1 char.
      expect(svc.normalize('https://example.com/')).toBe('https://example.com/');
    });
  });

  describe('fragment stripping', () => {
    it('strips the fragment', () => {
      const url = 'https://example.com/article?id=1#section-2';
      expect(svc.normalize(url)).toBe('https://example.com/article?id=1');
    });
  });

  describe('param sorting', () => {
    it('sorts remaining params alphabetically', () => {
      const url = 'https://example.com/p?z=last&a=first&m=mid';
      expect(svc.normalize(url)).toBe('https://example.com/p?a=first&m=mid&z=last');
    });
  });

  describe('combined', () => {
    it('normalizes a realistic dirty URL', () => {
      const dirty =
        'https://Blog.Example.COM/The-Article/?utm_source=hn&utm_medium=social&ref=pocket&id=99#comments';
      expect(svc.normalize(dirty)).toBe('https://blog.example.com/The-Article?id=99');
    });
  });

  describe('error surface', () => {
    it('throws on input that URL() cannot parse', () => {
      expect(() => svc.normalize('not a url')).toThrow();
    });
  });
});
