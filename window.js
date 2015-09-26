function extractTime(datetime)
{
    return datetime.split("T")[1].split(".")[0].split(")")[0].substring(0, 5);
}

function copyToClipboard(text)
{
    var copyDiv = document.createElement("div");
    copyDiv.contentEditable = true;
    document.body.appendChild(copyDiv);
    copyDiv.innerHTML = text;
    copyDiv.unselectable = "off";
    copyDiv.focus();
    document.execCommand("SelectAll");
    document.execCommand("Copy", false, null);
    document.body.removeChild(copyDiv);
}

function markSmsAsRead($sms)
{
    chrome.storage.local.get("readSms", function(storage){
        var readSms = storage["readSms"] || {};

        readSms[$sms.data("id")] = true;
        chrome.storage.local.set({"readSms": readSms});

        $sms.slideUp(400, function(){
            $(this).remove();
        });
    });
}

var disordersMode = 0;
function showHideDisorders()
{
    if (disordersMode == 0)
    {
        $("#disorders").find("li.ok").hide();
    }
    if (disordersMode == 1)
    {
        $("#disorders").find("li.ok").show();
    }

    $("#disorders").find("li.first-child, li.last-child").removeClass("first-child last-child");
    $("#disorders").find("ul").each(function(){
        $(this).find(">li:visible:first").addClass("first-child");
        $(this).find(">li:visible:last").addClass("last-child");
    });
}

chrome.commands.onCommand.addListener(function(command){
    if (command == "read_sms")
    {
        var $sms = $("#sms").find("li:first");
        if ($sms.length)
        {
            markSmsAsRead($sms);
        }
    }

    if (command == "toggle_disorders_mode")
    {
        disordersMode = (disordersMode + 1) % 2;
        chrome.storage.local.set({"disordersMode": disordersMode});
        showHideDisorders();
    }
});

$(function(){
    var $music = $("#music");
    $music.on("click", "li", function(event){
        $.ajax({
            type: "POST",
            url: "http://console.thelogin.ru/mpd/add",

            contentType: "application/json",
            data: JSON.stringify({"entry": $(this).text()}),
        });
        $(this).slideUp(400, function(){
            $(this).remove();
        });
        event.preventDefault();
    });

    var ws,
        connect,
        on_error;
    connect = function(){
        ws = new WebSocket("ws://192.168.0.1:46405/feed/music?limit=0");

        ws.onclose = on_error;

        ws.onmessage = function(event){
            var item = $.parseJSON(event.data);

            $.each(item["args"]["args"][1], function(i, title){
                var $li = $("<li/>");
                $li.text(title);
                $li.hide();
                $li.prependTo($music).slideDown(400);

                setTimeout(function(){
                    $li.slideUp(400, function(){
                        $li.remove();
                    });
                }, 60000);
            });
        }
    };
    on_error = function(){
        setTimeout(connect, 1000);
    };
    connect();
}); 

$(function(){
    var $tv_shows = $("#tv-shows");

    var ws,
        connect,
        on_error;
    connect = function(){
        ws = new WebSocket("ws://192.168.0.1:46405/analytics/tv_shows");

        ws.onclose = on_error;

        ws.onmessage = function(event){
            var shows = $.parseJSON(event.data);

            var unseen = {};
            $.each(shows, function(show, seasons){
                $.each(seasons, function(season, episodes){
                    $.each(episodes, function(episode, qualities){
                        var watched = false;
                        var hidden = false;
                        $.each(qualities, function(quality, data){
                            if (data["state"] == "watched")
                            {
                                watched = true;
                                return false;
                            }
                            if (data["state"] == "hidden")
                            {
                                hidden = true;
                                return false;
                            }
                        });

                        if (!(watched || hidden))
                        {
                            unseen[show + " " +
                                   (isNaN(parseInt(episode)) ?
                                    episode :
                                    ("E" + (parseInt(episode) < 10 ? "0" : "") + episode))] = qualities;
                        }
                    });
                });
            });

            if ($.isEmptyObject(unseen))
            {
                $tv_shows.hide();
            }
            else
            {
                var $table = $("<table/>");
                $table.append("<tr><th>Сериалы</th><th>1080p</th><th>720p</th><th>HDTV</th></tr>");
                _.each(_.sortBy(_.keys(unseen), function(t){ return t; }), function(episode){
                    var $tr = $("<tr/>");
                    $tr.append("<td>" + episode + "</td>");
                    _.each(["1080p", "720p", ""], function(quality){
                        var $td = $("<td/>");
                        var e = unseen[episode][quality];
                        if (e)
                        {
                            $td.addClass(e["state"]);
                            _.each(_.sortBy(e["subtitles"], function(lang){ return lang; }), function(lang){
                                $td.append('<span class="sub sub-' + lang + '"></span>');
                                $td.removeClass("downloaded");
                            });
                        }
                        $tr.append($td);
                    });
                    $tr.click(function(){
                        chrome.sockets.tcp.create({}, function(createInfo){
                            chrome.sockets.tcp.connect(createInfo.socketId, "192.168.0.1", 46404, function(result){
                                var buffer = "application=themylog-panel\n" +
                                             "logger=movie\n" +
                                             "msg=hide\n" +
                                             "level=info\n" +
                                             "movie=" + unseen[episode][_.keys(unseen[episode])[0]]["file"];
                                chrome.sockets.tcp.send(createInfo.socketId, new TextEncoder().encode(buffer).buffer, function(sendInfo){
                                    chrome.sockets.tcp.close(createInfo.socketId, function(){
                                    });
                                });
                            });
                        });
                    });
                    $table.append($tr);
                });

                $tv_shows.html("");
                $tv_shows.append($table);
                $tv_shows.show();
            }
        }
    };
    on_error = function(){
        setTimeout(connect, 1000);
    };
    connect();
}); 

$(function(){
    var $sms = $("#sms");
    $sms.on("contextmenu", "li", function(event){
        markSmsAsRead($(this));
        event.preventDefault();
    });

    var ws,
        connect,
        on_error;
    connect = function(){
        ws = new WebSocket("ws://192.168.0.1:46405/feed/sms");

        ws.onclose = on_error;

        ws.onmessage = function(event){
            var item = $.parseJSON(event.data);

            var id = item["msg"];
            chrome.storage.local.get("readSms", function(storage){
                var readSms = storage["readSms"] || {};
                
                if (id in readSms)
                {
                    return;
                }

                var time = extractTime(item["datetime"]);
                var text = item["explanation"]

                text = _.escape(text).replace(/\n/g, "<br />");
                $.each([
                        /Parol dlya vhoda.*?([0-9]+)/,
                        /kod podtverzhdeniya.*?([0-9]+)(\.|;)/i,
                        /parol:.*?([0-9]+)/i,
                        /Код:([0-9]+) сумма:[0-9]/
                        ], function(i, regexp){
                    var m = text.match(regexp);
                    if (m)
                    {
                        copyToClipboard(m[1]);
                        text = text.replace(m[1], '<span class="highlight">' + m[1] + '</span>');

                        return false;
                    }
                });

                var html = '<div class="from">' + item["logger"] + '</div>';
                html += '<div class="time">' + time +  '</div>';
                html += '<div class="text">' + text + '</div>';

                var $item = $("<li/>");
                $item.data("id", id);
                $item.html(html);

                $sms.hide().prepend($item).slideDown(400);
            });            
        }
    };
    on_error = function(){
        setTimeout(connect, 1000);
    };
    connect();
}); 

$(function(){
    chrome.storage.local.get("disordersMode", function(storage){
        disordersMode = storage["disordersMode"];
        if (disordersMode === undefined)
        {
            disordersMode = 1;
        }
        showHideDisorders();
    });

    function createDisorder(maybe)
    {
        var $disorder = $("<li/>");
        if (maybe.disorder)
        {
            $disorder.append($("<div/>").addClass("time").text(extractTime(maybe.disorder.datetime)));
            $disorder.append($("<div/>").addClass("text").text(maybe.title));
            $disorder.addClass(maybe.is_disorder ? "error" : "ok");

            if (maybe.disorder.reason != null)
            {
                var $reason;
                if ($.isArray(maybe.disorder.reason))
                {
                    $reason = $("<ul/>");
                    $.each(maybe.disorder.reason, function(i, child_maybe){
                        if ($.type(child_maybe.disorder) == "string")
                        {
                            var $child_disorder = $("<li/>");
                            $child_disorder.append($("<div/>").addClass("text").text(child_maybe.disorder));
                            $child_disorder.addClass(child_maybe.is_disorder ? "error" : "ok");
                            $reason.append($child_disorder);
                        }
                        else
                        {
                            $reason.append(createDisorder(child_maybe));
                        }
                    });
                }
                else
                {
                    $reason = $("<div/>").text(maybe.disorder.reason);
                }

                $reason.addClass("reason");
                $disorder.append($reason);
            }
        }
        else
        {
            $disorder.append($("<div/>").addClass("text").text(maybe.title));
            $disorder.addClass("not-functional");
        }

        return $disorder;
    }

    var $disorders = $("#disorders");
    var ws,
        connect,
        on_error;
    connect = function(){
        ws = new WebSocket("ws://192.168.0.1:46405/disorders");

        ws.onclose = on_error;

        ws.onmessage = function(event){
            $disorders.empty();
            $.each($.parseJSON(event.data), function(i, maybe){
                $disorders.append(createDisorder(maybe));
            });
            showHideDisorders();
        }
    };
    on_error = function(){
        setTimeout(connect, 1000);
    };
    connect();
}); 
