using System;
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

        readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        readonly DispatcherTimer _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };

        public MainWindow()
        {
            InitializeComponent();
            _timer.Tick += async (s, e) => await Refresh();
            Loaded += async (s, e) => { TryDarkTitleBar(); await Refresh(); _timer.Start(); };
        }

        async Task Refresh()
        {
            try
            {
                var json = await _http.GetStringAsync("http://127.0.0.1:8080/health");
                using var doc = JsonDocument.Parse(json);
                var streams = doc.RootElement.GetProperty("streams");
                DotSup.Fill = Green;
                TxtSup.Text = $"Supervisor    UP    ({streams.GetArrayLength()} streams)";
                ListStreams.Items.Clear();
                foreach (var st in streams.EnumerateArray())
                {
                    string id = st.GetProperty("streamId").GetString() ?? "?";
                    string status = st.GetProperty("status").GetString() ?? "?";
                    string url = st.GetProperty("obsInputUrl").GetString() ?? "";
                    int rc = st.GetProperty("restartCount").GetInt32();
                    ListStreams.Items.Add($"{id}   [{status}]   {url}   restarts={rc}");
                }
            }
            catch
            {
                DotSup.Fill = Red;
                TxtSup.Text = "Supervisor    DOWN";
                ListStreams.Items.Clear();
            }

            try
            {
                var resp = await _http.GetAsync("http://127.0.0.1:3000/");
                DotWeb.Fill = Green;
                TxtWeb.Text = $"Web UI        UP    (HTTP {(int)resp.StatusCode})";
            }
            catch
            {
                DotWeb.Fill = Red;
                TxtWeb.Text = "Web UI        DOWN";
            }

            int sl = Process.GetProcessesByName("streamlink").Length;
            int ff = Process.GetProcessesByName("ffmpeg").Length;
            TxtRelay.Text = $"relay procs:  streamlink={sl}   ffmpeg={ff}";
        }

        void RunHelper(string script)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "powershell",
                    Arguments = $"-NoProfile -ExecutionPolicy Bypass -File \"{Path.Combine(REPO, script)}\"",
                    WorkingDirectory = REPO,
                    UseShellExecute = false,
                    CreateNoWindow = true
                });
            }
            catch { }
        }

        static void OpenUrl(string url)
        {
            try { Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true }); } catch { }
        }

        void BtnStart_Click(object sender, RoutedEventArgs e) => RunHelper("mon-start.ps1");
        void BtnStop_Click(object sender, RoutedEventArgs e) => RunHelper("mon-stop.ps1");
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
