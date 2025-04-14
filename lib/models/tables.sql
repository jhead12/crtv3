table videos {
    stream_id text [pk]
    controller text [not null]
    title text [not null]
    assetId text [unique, not null]
    category text
    location text
    playbackId text [unique, not null]
    description text
    thumbnailUri text
    subtitlesUri text
    created_at timestamp [default: `now()`]
}

table users {
    stream_id text [pk]
    controller text [not null]
    address text [unique, not null]
    token_name text
    token_symbol text
    created_at timestamp [default: `now()`]

    indexes {
        address
    }
}

// Relationships
Ref: videos.controller > users.address
