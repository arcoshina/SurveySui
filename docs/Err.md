### Content Security Policy of your site blocks the use of 'eval' in JavaScript`
The Content Security Policy (CSP) prevents the evaluation of arbitrary strings as JavaScript to make it more difficult for an attacker to inject unathorized code on your site.

To solve this issue, avoid using eval(), new Function(), setTimeout([string], ...) and setInterval([string], ...) for evaluating strings.

If you absolutely must: you can enable string evaluation by adding unsafe-eval as an allowed source in a script-src directive.

⚠️ Allowing string evaluation comes at the risk of inline script injection.

1 directive
Source location	Directive	Status
script-src	blocked
Learn more: Content Security Policy - Eval

### Deprecated feature used
The Shared Storage API is deprecated and will be removed in a future release.

1 source
contentscript.js:14083
Learn more: Check the feature status page for more details.