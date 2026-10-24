//! The writes in progress, and the close of the window that waits for them: an import commit, a
//! folder move, an export save, a saved-view write, and the demo build each hold a
//! [`WriteGuard`] for as long as they write.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;

/// The event the interface hears when a close of the window is held back until the writes end.
pub const CLOSING_HELD: &str = "closing-held";

/// The event the interface hears when a close that was held back could not be carried out once
/// the writes ended: the window stays open, and the user can close it again.
pub const CLOSING_RESUMED: &str = "closing-resumed";

/// The bit of the count that says a close of the window waits for the writes to end. The writes
/// in progress are the other bits: far more than will ever run at once.
const HELD: usize = 1 << (usize::BITS - 1);

/// What a request to close the window comes to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseRequest {
    /// No write is in progress: the window closes.
    Close,
    /// A write is in progress: the close is held back until the last write ends, and the
    /// interface is told so.
    Held,
    /// A close is held back already: this request changes nothing.
    AlreadyHeld,
}

/// Counts writes in progress; dropping the guard ends the write.
///
/// A close of the window asked for while a write is in progress is held back and remembered,
/// in the same count, so that no write can end between the check and the remembering. When the
/// last write ends after that, the function given to [`Writes::closes_with`] is called once.
#[derive(Default)]
pub struct Writes {
    /// The writes in progress, with [`HELD`] set while a close waits for them.
    count: AtomicUsize,
    /// What closes the window once a close that was held back may go ahead.
    close: OnceLock<Box<dyn Fn() + Send + Sync>>,
}

/// One write in progress. The write ends when the guard is dropped, also by a panic.
#[must_use = "the write ends as soon as the guard is dropped"]
pub struct WriteGuard<'a>(&'a Writes);

impl Writes {
    /// Starts a write, which lasts as long as the guard.
    pub fn begin(&self) -> WriteGuard<'_> {
        self.count.fetch_add(1, Ordering::AcqRel);
        WriteGuard(self)
    }

    /// Whether a write is in progress.
    pub fn busy(&self) -> bool {
        self.count.load(Ordering::Acquire) & !HELD > 0
    }

    /// Sets what closes the window when a close that was held back may go ahead. Only the first
    /// function given is kept: there is one window.
    pub fn closes_with(&self, close: impl Fn() + Send + Sync + 'static) {
        // A second function is dropped: the first one closes the one window already.
        let _ = self.close.set(Box::new(close));
    }

    /// Decides a request to close the window: closed when no write is in progress, held back
    /// and remembered otherwise. A request while one is held back already changes nothing.
    pub fn close_requested(&self) -> CloseRequest {
        if !self.busy() {
            return CloseRequest::Close;
        }
        // A write may end meanwhile: the count is checked again as the close is remembered.
        let remembered = self
            .count
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                (count & !HELD > 0 && count & HELD == 0).then_some(count | HELD)
            });
        match remembered {
            Ok(_) => CloseRequest::Held,
            Err(count) if count & HELD != 0 => CloseRequest::AlreadyHeld,
            Err(_) => CloseRequest::Close,
        }
    }

    /// Ends a write. The last one to end after a close was held back forgets the close and asks
    /// for it again.
    fn end(&self) {
        let last_held = HELD | 1;
        let before = self
            .count
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                Some(if count == last_held { 0 } else { count - 1 })
            });
        if before == Ok(last_held) {
            if let Some(close) = self.close.get() {
                close();
            }
        }
    }
}

impl Drop for WriteGuard<'_> {
    fn drop(&mut self) {
        self.0.end();
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use super::{CloseRequest, Writes};

    /// Writes whose close is counted instead of carried out.
    fn recorded() -> (Writes, Arc<AtomicUsize>) {
        let writes = Writes::default();
        let closes = Arc::new(AtomicUsize::new(0));
        let counted = closes.clone();
        writes.closes_with(move || {
            counted.fetch_add(1, Ordering::SeqCst);
        });
        (writes, closes)
    }

    #[test]
    fn the_interface_listens_for_the_event_by_its_name() {
        let window = include_str!("../../../ui/src/api/window.ts");
        assert!(
            window.contains(&format!(
                "const CLOSING_HELD = \"{}\";",
                super::CLOSING_HELD
            )),
            "ui/src/api/window.ts listens for another event"
        );
        assert!(
            window.contains(&format!(
                "const CLOSING_RESUMED = \"{}\";",
                super::CLOSING_RESUMED
            )),
            "ui/src/api/window.ts listens for another event"
        );
    }

    #[test]
    fn busy_follows_the_guards() {
        let writes = Writes::default();
        assert!(!writes.busy());
        let first = writes.begin();
        assert!(writes.busy());
        let second = writes.begin();
        drop(first);
        assert!(writes.busy(), "one write is still in progress");
        drop(second);
        assert!(!writes.busy());
    }

    #[test]
    fn a_guard_dropped_by_a_panic_ends_its_write() {
        let writes = Writes::default();
        let panicked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _write = writes.begin();
            panic!("the write panics on purpose");
        }));
        assert!(panicked.is_err());
        assert!(!writes.busy());
    }

    #[test]
    fn a_close_while_no_write_runs_goes_ahead() {
        let (writes, closes) = recorded();
        assert_eq!(writes.close_requested(), CloseRequest::Close);
        drop(writes.begin());
        assert_eq!(writes.close_requested(), CloseRequest::Close);
        assert_eq!(closes.load(Ordering::SeqCst), 0, "the window closes itself");
    }

    #[test]
    fn a_close_while_busy_is_held_back_and_remembered() {
        let (writes, closes) = recorded();
        let write = writes.begin();
        assert_eq!(writes.close_requested(), CloseRequest::Held);
        // Remembered: a second request does nothing more.
        assert_eq!(writes.close_requested(), CloseRequest::AlreadyHeld);
        assert!(writes.busy());
        assert_eq!(closes.load(Ordering::SeqCst), 0);
        drop(write);
        assert_eq!(closes.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn the_close_is_asked_for_when_the_last_write_ends_and_only_then() {
        let (writes, closes) = recorded();
        let first = writes.begin();
        let second = writes.begin();
        assert_eq!(writes.close_requested(), CloseRequest::Held);
        drop(first);
        assert_eq!(
            closes.load(Ordering::SeqCst),
            0,
            "a write is still in progress"
        );
        // A write that starts while the close waits is waited for as well.
        let third = writes.begin();
        drop(second);
        assert_eq!(closes.load(Ordering::SeqCst), 0);
        drop(third);
        assert_eq!(closes.load(Ordering::SeqCst), 1);
        assert!(!writes.busy());
        // The close was asked for once and is forgotten: the next write closes nothing.
        drop(writes.begin());
        assert_eq!(closes.load(Ordering::SeqCst), 1);
        assert_eq!(writes.close_requested(), CloseRequest::Close);
    }

    #[test]
    fn a_write_that_ends_without_a_held_close_asks_for_none() {
        let (writes, closes) = recorded();
        drop(writes.begin());
        drop(writes.begin());
        assert_eq!(closes.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn writes_on_other_threads_are_counted_together() {
        let (writes, closes) = recorded();
        let writes = Arc::new(writes);
        let started = Arc::new(std::sync::Barrier::new(9));
        let finish = Arc::new(std::sync::Barrier::new(9));
        let threads: Vec<_> = (0..8)
            .map(|_| {
                let (writes, started, finish) = (writes.clone(), started.clone(), finish.clone());
                std::thread::spawn(move || {
                    let _write = writes.begin();
                    started.wait();
                    finish.wait();
                })
            })
            .collect();
        started.wait();
        assert_eq!(writes.close_requested(), CloseRequest::Held);
        finish.wait();
        for thread in threads {
            thread.join().unwrap();
        }
        assert!(!writes.busy());
        assert_eq!(closes.load(Ordering::SeqCst), 1);
    }
}
