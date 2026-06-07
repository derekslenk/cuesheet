using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace CueSheetMonitor
{
    public partial class MainWindow : Window
    {
        const string REPO = @"C:\Users\derek\dev\src\cuesheet";
        static readonly Brush Green = new SolidColorBrush(Color.FromRgb(0x4F, 0xD1, 0x8A));
        static readonly Brush Red   = new SolidColorBrush(Color.FromRgb(0xE8, 0x5A, 0x5A));

        // UseProxy=false avoids WinHTTP/WPAD proxy auto-detection, which runs on the
        // first request and can block for many seconds -> the startup freeze.
        readonly HttpClient _http = new HttpClient(new HttpClientHandler { UseProxy = false })
        {
            Timeout = TimeSpan.FromSeconds(2)
        };
        readonly DispatcherTimer _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        bool _busy;

        public MainWindow()
        {
            InitializeComponent();
            _timer.Tick += async (s, e) => await Refresh();
            Loaded += (s, e) =>
            {
                TryDarkTitleBar();
                _timer.Start();
                _ = Refresh();   // fire-and-forget: never block the first paint on a poll
            };
        }

        sealed class Snapshot
        {
            public bool SupUp;
            public string SupText = "Supervisor    DOWN";
            public List<string> Streams = new();
            public bool WebUp;
            public string WebText = "Web UI        DOWN";
            public string RelayText = "relay procs:  streamlink=0   ffmpeg=0";
        }

        async Task Refresh()
        {
            if (_busy) return;          // skip if a prior poll is still in flight
            _busy = true;
            try
            {
                // All blocking I/O runs off the UI thread; UI updates resume here after await.
                Snapshot snap = await Task.Run(Poll);
                DotSup.Fill = snap.SupUp ? Green : Red;
                TxtSup.Text = snap.SupText;
                ListStreams.Items.Clear();
                foreach (var line in snap.Streams) ListStreams.Items.Add(line);
                DotWeb.Fill = snap.WebUp ? Green : Red;
                TxtWeb.Text = snap.WebText;
                TxtRelay.Text = snap.RelayText;
            }
            catch { /* a failed refresh must never crash or freeze the UI */ }
            finally { _busy = false; }
        }

        Snapshot Poll()
        {
            var snap = new Snapshot();
            try
            {
                var json = _http.GetStringAsync("http://127.0.0.1:8080/health").GetAwaiter().GetResult();
                using var doc = JsonDocument.Parse(json);
                var streams = doc.RootElement.GetProperty("streams");
                snap.SupUp = true;
                snap.SupText = $"Supervisor    UP    ({streams.GetArrayLength()} streams)";
                foreach (var st in streams.EnumerateArray())
                {
                    string id = st.GetProperty("streamId").GetString() ?? "?";
                    string status = st.GetProperty("status").GetString() ?? "?";
                    string url = st.GetProperty("obsInputUrl").GetString() ?? "";
                    int rc = st.GetProperty("restartCount").GetInt32();
                    snap.Streams.Add($"{id}   [{status}]   {url}   restarts={rc}");
                }
            }
            catch { snap.SupUp = false; }

            try
            {
                var resp = _http.GetAsync("http://127.0.0.1:3000/").GetAwaiter().GetResult();
                snap.WebUp = true;
                snap.WebText = $"Web UI        UP    (HTTP {(int)resp.StatusCode})";
            }
            catch { snap.WebUp = false; }

            int sl = Process.GetProcessesByName("streamlink").Length;
            int ff = Process.GetProcessesByName("ffmpeg").Length;
            snap.RelayText = $"relay procs:  streamlink={sl}   ffmpeg={ff}";
            return snap;
        }

        void RunHelper(string script, string which = "")
        {
            try
            {
                var psArgs = $"-NoProfile -ExecutionPolicy Bypass -File \"{Path.Combine(REPO, script)}\"";
                if (!string.IsNullOrEmpty(which)) psArgs += $" {which}";
                Process.Start(new ProcessStartInfo
                {
                    FileName = "powershell",
                    Arguments = psArgs,
                    WorkingDirectory = REPO,
                    UseShellExecute = false,
                    CreateNoWindow = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to run {script} {which}: {ex.Message}", "CueSheet",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        static void OpenUrl(string url)
        {
            try { Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true }); } catch { }
        }

        // Supervisor and webui can be started/stopped independently — e.g. start
        // the webui WITHOUT the supervisor for a load-test run.
        void BtnStartSup_Click(object sender, RoutedEventArgs e) => RunHelper("mon-start.ps1", "sup");
        void BtnStartWeb_Click(object sender, RoutedEventArgs e) => RunHelper("mon-start.ps1", "web");
        void BtnStopAll_Click(object sender, RoutedEventArgs e) => RunHelper("mon-stop.ps1", "both");
        void BtnStopSup_Click(object sender, RoutedEventArgs e) => RunHelper("mon-stop.ps1", "sup");
        void BtnDash_Click(object sender, RoutedEventArgs e) => OpenUrl("http://localhost:8080/");
        void BtnWeb_Click(object sender, RoutedEventArgs e) => OpenUrl("http://localhost:3000/");

        void TryDarkTitleBar()
        {
            try
            {
                var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
                int yes = 1;
                DwmSetWindowAttribute(hwnd, 20, ref yes, sizeof(int));
            }
            catch { }
        }

        [DllImport("dwmapi.dll")]
        static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int val, int size);
    }
}
