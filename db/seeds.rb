# Seeds for development — creates sample stories & comments
# Run: bin/rails db:seed

puts "Seeding..."

# Create a demo user if none exists
demo = User.find_or_create_by!(email: "demo@newsroom.test") do |u|
  u.name = "Demo Reporter"
  u.google_uid = "demo_seed_#{SecureRandom.hex(8)}"
  u.avatar_url = nil
end

colleague = User.find_or_create_by!(email: "colleague@newsroom.test") do |u|
  u.name = "Alex Chen"
  u.google_uid = "colleague_seed_#{SecureRandom.hex(8)}"
  u.avatar_url = nil
end

viewer = User.find_or_create_by!(email: "viewer@newsroom.test") do |u|
  u.name = "Sam Taylor"
  u.google_uid = "viewer_seed_#{SecureRandom.hex(8)}"
  u.avatar_url = nil
end

# Stories
stories_data = [
  {
    user: demo,
    title: "City Council Approves Green Energy Initiative",
    body: "The city council voted unanimously today to approve a \u00a3200M investment in renewable energy infrastructure. The plan includes solar panel subsidies for residential buildings, new wind farms on the outskirts, and a network of electric vehicle charging points across all boroughs.",
    story_type: "video",
    analysis: "Video analysis shows a packed council chamber with strong audience engagement. Key moments include the mayor's speech at 1:23, the vote tally reveal at 4:45, and crowd reaction at 5:02. Sentiment is overwhelmingly positive with 73% favourable social media mentions. Recommended as lead story for tonight's broadcast."
  },
  {
    user: colleague,
    title: "Global Tech Summit: AI Takes Centre Stage",
    body: "Day two of the Global Tech Summit saw major announcements from leading AI companies. Keynote speakers outlined visions for responsible AI development, with several firms pledging new safety commitments. The audience of 5,000 tech professionals heard about breakthroughs in multimodal AI systems.",
    story_type: "video",
    analysis: "Audio analysis detected 12 distinct applause breaks during the keynote. Peak audience engagement occurred during the live AI demonstration at 15:32. Three speakers referenced new regulatory frameworks. The footage quality is broadcast-ready with good lighting throughout."
  },
  {
    user: viewer,
    title: "New Riverside Park Opens This Weekend",
    body: "Families can look forward to the grand opening of Riverside Park this Saturday. The 15-acre green space features a children's playground, outdoor amphitheatre, and a mile-long walking trail along the river. Local food vendors will be on site for the opening celebration.",
    story_type: "image",
    analysis: "Image analysis shows a well-landscaped park space with modern amenities. The playground equipment appears new and meets current safety standards. Aerial shots reveal ample parking and good access routes. Recommended B-roll for weekend lifestyle segment."
  },
  {
    user: demo,
    title: "Morning Traffic Update: Roadworks on the A40",
    body: "Commuters should expect delays of up to 30 minutes on the A40 westbound this week as essential water main repairs continue. Alternative routes via the B4437 are recommended.",
    story_type: "text",
    analysis: nil
  }
]

stories = stories_data.map do |data|
  Story.create!(
    user: data[:user],
    title: data[:title],
    body: data[:body],
    story_type: data[:story_type],
    analysis: data[:analysis],
    broadcast_at: Time.current.change(hour: 19),
    expires_at: Time.current.end_of_day
  )
end

# Comments on the first story
comments_data = [
  { user: colleague, story: stories[0], body: "Brilliant coverage! The crowd reaction shot is perfect for the opening.", emoji: "🔥", comment_type: "text" },
  { user: viewer,    story: stories[0], body: "I live in Borough East — really hoping the solar subsidies extend to flats as well as houses.", emoji: "👍", comment_type: "text" },
  { user: demo,      story: stories[0], body: "Thanks team. I'll have an updated script ready by 5 PM.", emoji: "💯", comment_type: "text" },
  { user: colleague, story: stories[0], body: "Can we get a follow-up interview with Councillor Patel? She had some strong quotes.", emoji: "🎯", comment_type: "text" },

  # Comments on the second story
  { user: demo,      story: stories[1], body: "The AI demo footage is incredible. Definitely worth a 3-minute segment.", emoji: "🔥", comment_type: "text" },
  { user: viewer,    story: stories[1], body: "Anyone else notice the audience reaction when they showed the multimodal capabilities?", emoji: "😮", comment_type: "text" },

  # Comments on the third story
  { user: colleague, story: stories[2], body: "I can head down Saturday morning to get some vox pops from families at the opening.", emoji: "📰", comment_type: "text" },
  { user: demo,      story: stories[2], body: "Perfect — let's pair it with the aerial shots for a nice package.", emoji: "👍", comment_type: "text" }
]

comments_data.each { |data| Comment.create!(**data) }

puts "Seeded #{Story.count} stories and #{Comment.count} comments."
