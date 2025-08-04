# calibre-kavita-mirror

A simple docker watcher script that will mirror a Calibre library into a [Kavita-compatible](https://wiki.kavitareader.com/guides/scanner/) one

This image is meant to be used with [Calibre-Web-Automated](https://github.com/crocodilestick/Calibre-Web-Automated)

The mirrored directory uses hardlinks so it does not take up any extra space on your disk

For example if you have a Calibre library that looks like this:

```
├── Jane Doe
│   ├── A Book
│   │   ├── A Book.epub
│   │   └── metadata.opf
│   └── Another  Book
│       ├── Another_Book.epub
│       └── metadata.opf
└── John Smith
    ├── First Book
    │   ├── First Book.epub
    │   └── metadata.opf
    ├── Just a Book
    │   ├── Just a Book.epub
    │   └── metadata.opf
    └── Third Book
        ├── metadata.opf
        └── Third Book.epub
```

calibre-kavita-mirror will create a structure like this:

```
├── A Book - Jane Doe
│   └── A Book - Jane Doe.epub
├── Another Book - Jane Doe
│   └── Another Book - Jane Doe.epub
├── Books
│   ├── Books - 01.epub
│   └── Books - 03.epub
└── Just a Book - John Smith
    └── Just a Book - John Smith.epub
```

## Example Docker Compose

```
calibre-kavita-mirror:
  image: ghcr.io/jthoward64/calibre-kavita-mirror:main
  environment:
    - SOURCE_DIR=/data/books
    - TARGET_DIR=/data/kavita-books
  user: "911:911"
  volumes:
    - ${DATA_DIR_ARR_DATA}/media:/data
  network_mode: none
```
