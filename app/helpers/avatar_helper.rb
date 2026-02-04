module AvatarHelper
  def user_avatar(user, size: "w-8")
    if user&.avatar_url.present?
      content_tag(:div, class: "avatar") do
        content_tag(:div, class: "#{size} rounded-full") do
          image_tag(user.avatar_url, alt: "", referrerpolicy: "no-referrer")
        end
      end
    else
      initial = user&.name&.first&.upcase || "?"
      content_tag(:div, class: "avatar placeholder") do
        content_tag(:div, class: "bg-neutral text-neutral-content #{size} rounded-full") do
          content_tag(:span, initial)
        end
      end
    end
  end
end
