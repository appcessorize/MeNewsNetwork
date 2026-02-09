module StudioHelper
  def badge_class_for(status)
    case status
    when "draft"    then "badge-ghost"
    when "analyzing" then "badge-warning"
    when "ready"    then "badge-success"
    when "failed"   then "badge-error"
    else "badge-ghost"
    end
  end

  def story_badge_class(status)
    case status
    when "pending"   then "badge-ghost"
    when "analyzing" then "badge-warning"
    when "done"      then "badge-success"
    when "failed"    then "badge-error"
    else "badge-ghost"
    end
  end
end
