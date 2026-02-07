module ApplicationHelper
  # Lazy-load a JavaScript module after page becomes interactive
  # Usage: <%= lazy_javascript_module_tag "newsroom" %>
  def lazy_javascript_module_tag(module_name)
    content_tag(:script, "window.lazyLoadModule && window.lazyLoadModule('#{module_name}');".html_safe, type: "module")
  end
end
