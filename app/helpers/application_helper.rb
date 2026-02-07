module ApplicationHelper
  # Lazy-load a JavaScript module after page becomes interactive
  # Usage: <%= lazy_javascript_module_tag "newsroom" %>
  def lazy_javascript_module_tag(module_name)
    javascript_tag "window.lazyLoadModule && window.lazyLoadModule('#{module_name}');", type: "module", nonce: true
  end
end
