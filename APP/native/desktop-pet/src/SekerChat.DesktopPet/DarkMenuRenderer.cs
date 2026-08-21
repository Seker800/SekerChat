using System.Drawing;
using System.Drawing.Drawing2D;
using Forms = System.Windows.Forms;

namespace SekerChat.DesktopPet;

internal sealed class DarkMenuRenderer : Forms.ToolStripProfessionalRenderer
{
    private static readonly Color Background = Color.FromArgb(32, 34, 37);
    private static readonly Color Border = Color.FromArgb(62, 65, 70);
    private static readonly Color Hover = Color.FromArgb(56, 59, 64);
    private static readonly Color Foreground = Color.FromArgb(242, 243, 245);
    private static readonly Color Muted = Color.FromArgb(148, 155, 164);
    private static readonly Color Accent = Color.FromArgb(122, 162, 247);

    public DarkMenuRenderer()
        : base(new DarkMenuColorTable())
    {
        RoundedEdges = false;
    }

    protected override void OnRenderToolStripBackground(
        Forms.ToolStripRenderEventArgs e)
    {
        e.Graphics.Clear(Background);
    }

    protected override void OnRenderToolStripBorder(
        Forms.ToolStripRenderEventArgs e)
    {
        using var pen = new Pen(Border);
        var bounds = new Rectangle(
            0,
            0,
            Math.Max(0, e.ToolStrip.Width - 1),
            Math.Max(0, e.ToolStrip.Height - 1));
        e.Graphics.DrawRectangle(pen, bounds);
    }

    protected override void OnRenderMenuItemBackground(
        Forms.ToolStripItemRenderEventArgs e)
    {
        if (!e.Item.Selected)
        {
            return;
        }

        var bounds = new Rectangle(
            4,
            2,
            Math.Max(0, e.Item.Width - 8),
            Math.Max(0, e.Item.Height - 4));
        using var path = RoundedRectangle(bounds, 6);
        using var brush = new SolidBrush(Hover);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.FillPath(brush, path);
    }

    protected override void OnRenderItemText(
        Forms.ToolStripItemTextRenderEventArgs e)
    {
        e.TextColor = e.Item.Enabled
            ? e.Item.ForeColor
            : Muted;
        base.OnRenderItemText(e);
    }

    protected override void OnRenderSeparator(
        Forms.ToolStripSeparatorRenderEventArgs e)
    {
        using var pen = new Pen(Border);
        var y = e.Item.Height / 2;
        e.Graphics.DrawLine(pen, 12, y, Math.Max(12, e.Item.Width - 12), y);
    }

    protected override void OnRenderArrow(
        Forms.ToolStripArrowRenderEventArgs e)
    {
        var centerX = e.ArrowRectangle.Left + (e.ArrowRectangle.Width / 2);
        var centerY = e.ArrowRectangle.Top + (e.ArrowRectangle.Height / 2);
        using var pen = new Pen(e.Item?.Enabled != false ? Muted : Border, 1.6f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
        };
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.DrawLines(
            pen,
            [
                new Point(centerX - 2, centerY - 4),
                new Point(centerX + 2, centerY),
                new Point(centerX - 2, centerY + 4),
            ]);
    }

    protected override void OnRenderItemCheck(
        Forms.ToolStripItemImageRenderEventArgs e)
    {
        var size = 16;
        var bounds = new Rectangle(
            e.ImageRectangle.Left + ((e.ImageRectangle.Width - size) / 2),
            e.Item.ContentRectangle.Top + ((e.Item.ContentRectangle.Height - size) / 2),
            size,
            size);
        using var path = RoundedRectangle(bounds, 4);
        using var background = new SolidBrush(Accent);
        using var check = new Pen(Color.White, 1.8f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
        };

        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.FillPath(background, path);
        e.Graphics.DrawLines(
            check,
            [
                new Point(bounds.Left + 4, bounds.Top + 8),
                new Point(bounds.Left + 7, bounds.Top + 11),
                new Point(bounds.Left + 12, bounds.Top + 5),
            ]);
    }

    private static GraphicsPath RoundedRectangle(Rectangle bounds, int radius)
    {
        var diameter = radius * 2;
        var path = new GraphicsPath();
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(
            bounds.Right - diameter,
            bounds.Bottom - diameter,
            diameter,
            diameter,
            0,
            90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private sealed class DarkMenuColorTable : Forms.ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground => Background;
        public override Color ImageMarginGradientBegin => Background;
        public override Color ImageMarginGradientMiddle => Background;
        public override Color ImageMarginGradientEnd => Background;
        public override Color MenuBorder => Border;
        public override Color MenuItemBorder => Hover;
        public override Color MenuItemSelected => Hover;
        public override Color SeparatorDark => Border;
        public override Color SeparatorLight => Border;
    }
}
