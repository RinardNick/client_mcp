/**
 * TS-MCP-Client Documentation JavaScript
 */

document.addEventListener('DOMContentLoaded', function () {
  // Mobile navigation toggle
  initMobileNavigation();

  // Highlight active navigation items
  highlightActiveNavItems();

  // Add copy buttons to code blocks
  addCodeCopyButtons();

  // Add anchor links to headings
  addHeadingAnchors();

  // Initialize collapsible sections on mobile
  initCollapsibleSections();
});

/**
 * Initialize mobile navigation
 */
function initMobileNavigation() {
  const navToggle = document.querySelector('.mobile-nav-toggle');
  const mainNav = document.getElementById('main-nav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', function () {
      mainNav.classList.toggle('active');

      // Toggle aria-expanded attribute for accessibility
      const expanded = mainNav.classList.contains('active');
      navToggle.setAttribute('aria-expanded', expanded);
    });

    // Close menu when clicking on links
    const navLinks = mainNav.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', function () {
        mainNav.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', function (event) {
      if (
        !event.target.closest('nav') &&
        mainNav.classList.contains('active')
      ) {
        mainNav.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

/**
 * Highlight active navigation items based on current URL
 */
function highlightActiveNavItems() {
  const currentPath = window.location.pathname;

  // Highlight main navigation
  const mainNavLinks = document.querySelectorAll('#main-nav a');
  mainNavLinks.forEach(link => {
    const linkPath = link.getAttribute('href');
    if (currentPath.startsWith(linkPath) && linkPath !== '/') {
      link.classList.add('active');
    }
  });

  // Highlight sidebar navigation
  const sidebarLinks = document.querySelectorAll('.sidebar a');
  sidebarLinks.forEach(link => {
    const linkPath = link.getAttribute('href');
    if (
      linkPath === currentPath ||
      (linkPath.startsWith('#') && window.location.hash === linkPath)
    ) {
      link.classList.add('active');

      // Open the parent details element if it exists
      const parentDetails = link.closest('details');
      if (parentDetails) {
        parentDetails.setAttribute('open', '');
      }
    }
  });
}

/**
 * Add copy buttons to code blocks
 */
function addCodeCopyButtons() {
  const codeBlocks = document.querySelectorAll('.code-block');

  codeBlocks.forEach(block => {
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.setAttribute('aria-label', 'Copy code to clipboard');
    copyButton.innerHTML = 'Copy';

    block.style.position = 'relative';
    block.appendChild(copyButton);

    copyButton.addEventListener('click', async () => {
      const code = block.querySelector('pre').textContent;

      try {
        await navigator.clipboard.writeText(code);
        copyButton.innerHTML = 'Copied!';

        setTimeout(() => {
          copyButton.innerHTML = 'Copy';
        }, 2000);
      } catch (err) {
        console.error('Failed to copy: ', err);
        copyButton.innerHTML = 'Failed';

        setTimeout(() => {
          copyButton.innerHTML = 'Copy';
        }, 2000);
      }
    });
  });

  // Add styles for copy buttons
  const style = document.createElement('style');
  style.textContent = `
    .copy-button {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      background-color: rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
      border: none;
      border-radius: 0.25rem;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    .code-block:hover .copy-button {
      opacity: 1;
    }
    
    .copy-button:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }
    
    @media (max-width: 768px) {
      .copy-button {
        opacity: 1;
      }
    }
    
    @media (prefers-color-scheme: dark) {
      .copy-button {
        background-color: rgba(255, 255, 255, 0.05);
      }
      
      .copy-button:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Add anchor links to headings
 */
function addHeadingAnchors() {
  const headings = document.querySelectorAll(
    '.content h2, .content h3, .content h4'
  );

  headings.forEach(heading => {
    if (heading.id) {
      const anchor = document.createElement('a');
      anchor.className = 'heading-anchor';
      anchor.href = `#${heading.id}`;
      anchor.innerHTML = '#';
      anchor.setAttribute('aria-hidden', 'true');

      heading.appendChild(anchor);
    }
  });

  // Add styles for heading anchors
  const style = document.createElement('style');
  style.textContent = `
    .heading-anchor {
      margin-left: 0.5rem;
      opacity: 0;
      font-size: 0.8em;
      text-decoration: none;
      color: var(--muted-color);
      transition: opacity 0.2s;
    }
    
    h2:hover .heading-anchor,
    h3:hover .heading-anchor,
    h4:hover .heading-anchor {
      opacity: 1;
    }
    
    @media (max-width: 768px) {
      .heading-anchor {
        opacity: 0.5;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Initialize collapsible sections on mobile
 */
function initCollapsibleSections() {
  // Only apply on mobile
  if (window.innerWidth <= 768) {
    const sections = document.querySelectorAll('.content section');

    sections.forEach(section => {
      const heading = section.querySelector('h2');

      if (heading && section.id) {
        heading.style.cursor = 'pointer';

        // Add toggle indicator
        const indicator = document.createElement('span');
        indicator.className = 'section-toggle';
        indicator.innerHTML = '▼';
        heading.appendChild(indicator);

        // Make section collapsible
        const content = document.createElement('div');
        content.className = 'section-content';

        // Move all content after the heading into the collapsible div
        let nextElement = heading.nextElementSibling;
        while (nextElement) {
          const temp = nextElement.nextElementSibling;
          content.appendChild(nextElement);
          nextElement = temp;
        }

        section.appendChild(content);

        // Toggle on heading click
        heading.addEventListener('click', e => {
          // Don't toggle if clicking on an anchor link
          if (e.target.tagName === 'A') return;

          content.classList.toggle('collapsed');
          indicator.innerHTML = content.classList.contains('collapsed')
            ? '▶'
            : '▼';
        });
      }
    });

    // Add styles for collapsible sections
    const style = document.createElement('style');
    style.textContent = `
      @media (max-width: 768px) {
        .section-toggle {
          margin-left: 0.5rem;
          font-size: 0.8em;
          color: var(--muted-color);
        }
        
        .section-content.collapsed {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
